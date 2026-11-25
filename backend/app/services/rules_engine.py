"""
Offline fallback "rules" mode — used when OPENAI_API_KEY is empty or the LLM API fails.

It follows the SAME path as the LLM agent (decide intent → call tools → reply),
just with keyword rules instead of a model. This keeps the app usable for
development, testing, and as a baseline in the evaluation (rules vs. LLM accuracy).
"""
import re

from . import tools
from .llm import AgentResult

KEYWORDS = {
    "food": ["lunch", "breakfast", "almusal", "dinner", "hapunan", "kain", "ulam", "rice", "kanin", "jollibee", "mcdo",
             "merienda", "snack", "grocer", "sari-sari", "mang inasal", "kape", "coffee", "bigas", "pagkain", "chowking",
             "carinderia", "tapsilog", "silog", "pandesal", "tinapay", "itlog", "noodles", "pancit", "turon", "fishball"],
    "transport": ["jeep", "bus", "mrt", "lrt", "grab", "angkas", "joyride", "move it", "tricycle", "trike", "taxi",
                  "pamasahe", "fare", "uv", "gas", "gasolina", "p2p", "beep"],
    "load": ["load", "globe", "smart", "dito", "tnt", "wifi", "data", "internet", "gomo", "promo"],
    "bills": ["meralco", "kuryente", "tubig", "water", "rent", "upa", "bill", "maynilad", "manila water", "electric"],
    "school": ["print", "photocopy", "xerox", "school", "project", "book", "libro", "tuition", "supplies", "ballpen",
               "notebook", "bond paper", "uniform"],
    "wants": ["milk tea", "milktea", "shopee", "lazada", "tiktok", "netflix", "spotify", "sine", "movie", "games",
              "shoes", "damit", "clothes", "starbucks", "concert", "skin", "skincare"],
}

QUESTION_RE = re.compile(r"\?|^(kasya|paano|how|what|ano|bakit|why|saan|where|is|can|should|ilan|gaano|magkano ang)\b", re.I)
MASKED_RE = re.compile(r"\*{4}(?: \*{4})* \d{4}|09\*\* \*\*\* \*\*\d{2}")


def categorize(text: str) -> str:
    lower = text.lower()
    for cat, words in KEYWORDS.items():
        if any(w in lower for w in words):
            return cat
    return "others"


def parse_amount(raw: str) -> float | None:
    m = re.search(r"(?:₱|php|p)?\s*(\d+(?:[.,]\d+)?)\s*(k)?(?![a-z])", raw, re.I) or re.search(r"(\d+(?:[.,]\d+)?)", raw)
    if not m:
        return None
    value = float(m.group(1).replace(",", ""))
    if m.lastindex and m.lastindex >= 2 and m.group(2):
        value *= 1000
    return value


def parse_expenses(text: str) -> list[dict]:
    text = MASKED_RE.sub(" ", text)
    items = []
    for part in re.split(r",|\n|;|\bat\b|\band\b|\btapos\b|\bpati\b", text, flags=re.I):
        part = part.strip()
        amount = parse_amount(part)
        if not part or not amount:
            continue
        note = re.sub(r"(?:₱|php)?\s*\d+(?:[.,]\d+)?(?:\s*k(?![a-z]))?", " ", part, count=1, flags=re.I)
        note = re.sub(r"\s+", " ", note).strip()
        items.append({"amount": amount, "category": categorize(note or part), "note": note.capitalize() if note else "Expense"})
    return items


def peso(v: float) -> str:
    return f"{'-' if v < 0 else ''}₱{abs(v):,.0f}"


def run(ctx: tools.ToolContext, message: str) -> AgentResult:
    lower = message.lower().strip()
    res = AgentResult(reply="", ctx=ctx)

    # 1) Affordability: "kaya ko ba bumili ng 1500 na shoes?"
    if re.search(r"afford|kaya ko ba|pwede ba.*bumili|bilhin|can i buy", lower):
        price = parse_amount(lower)
        if price:
            r = tools.execute(ctx, "check_affordability", {"price": price})
            res.intent = "check_affordability"
            if r.get("ok") is False:
                res.reply = r["error"]
            elif r["affordable"]:
                res.reply = f"Kaya! After mong bilhin ({peso(price)}), may {peso(r['remaining_after'])} ka pa, mga {peso(r['new_daily_allowance'])} per day."
            else:
                res.reply = (f"Medyo risky. Kapag binili mo ang {peso(price)}, bababa sa "
                             f"{peso(max(r['new_daily_allowance'], 0))} per day ang budget mo. Mas okay kung i-save mo muna ito as a goal.")
            return res

    # 2) Balance / status
    if re.search(r"\bmagkano pa\b|\bremaining\b|\bbalance\b|natitira|\bleft\b|kasya pa ba|\bstatus\b|\bilan pa\b|how much (do i have|is left)", lower) \
            and not re.search(r"\d{2,}", lower):
        r = tools.execute(ctx, "get_budget_summary", {})
        res.intent = "get_budget_summary"
        res.reply = r.get("error") or (
            f"May {peso(r['remaining'])} ka pa for the next {r['days_left']} day(s). Ang allowance mo today ay {peso(r['today_allowance'])}, "
            f"at {peso(max(r['left_today'], 0))} pa ang pwede mong gastusin.")
        return res

    # 3) Category breakdown
    if re.search(r"saan (napunta|napupunta)|where did .*(money|go)|by category|breakdown", lower):
        r = tools.execute(ctx, "get_spending_by_category", {})
        res.intent = "get_spending_by_category"
        top = r["categories"][:3]
        res.reply = "Top spending: " + ", ".join(f"{c['category']} {peso(c['total'])} ({c['percent']:.0f}%)" for c in top) if top else "Wala ka pang na-log na expenses sa budget period na 'to."
        return res

    # 4) Undo
    if re.search(r"\b(undo|burahin|mali yung|delete (the )?last)\b", lower):
        r = tools.execute(ctx, "undo_last_expense", {})
        res.intent = "undo_last_expense"
        res.reply = r.get("error") or f"Okay, na-delete ko na ang {r['deleted']['note']} ({peso(r['deleted']['amount'])})."
        return res

    # 5) Questions → knowledge base (never guess)
    if QUESTION_RE.search(lower):
        r = tools.execute(ctx, "search_knowledge_base", {"query": message})
        res.intent = "search_knowledge_base"
        if not r["results"]:
            res.reply = ("Wala akong mahanap na reliable source tungkol diyan, kaya hindi na ako manghuhula. "
                         "Try mong magtanong about food prices, pamasahe, budgeting, o pag-iipon.")
        else:
            top = r["results"][0]
            first = re.split(r"(?<=[.!?])\s", top["text"].replace("\n", " "))
            res.reply = " ".join(first[:2]).strip() + f" [{top['source_id']}]"
            res.cited = [top["source_id"]]
        return res

    # 6) Log expenses
    items = parse_expenses(message)
    if items:
        for it in items:
            tools.execute(ctx, "add_expense", it)
        res.intent = "add_expense"
        total = sum(i["amount"] for i in items)
        s = tools.execute(ctx, "get_budget_summary", {})
        ctx.calls.pop()  # internal lookup, not shown as a separate tool call
        if s.get("ok") is False:
            res.reply = f"Na-log ko na ang {len(items)} expense(s) mo ({peso(total)}). Mag-set up ka muna ng budget para ma-track ko ang allowance mo."
        else:
            left = s["left_today"]
            res.reply = (f"Na-log ko na ang {len(items)} expense{'s' if len(items) > 1 else ''} mo ({peso(total)} total). "
                         + (f"May {peso(left)} ka pa for today. Cashya pa!" if left >= 0
                            else f"Lumampas ka ng {peso(-left)} sa allowance mo today, kaya mag-a-adjust nang kaunti ang budget mo bukas."))
        return res

    res.intent = "help"
    res.reply = ('I-type mo lang ang expenses mo (e.g. "jeep 26, lunch 150"), itanong kung magkano pa ang natitira, '
                 'o tanungin mo ako, "afford ko ba ang ₱1,500 na shoes?"')
    return res

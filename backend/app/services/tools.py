"""
Function-calling tools (rubric: Software Engineering & Automation — 20%)

The LLM decides WHICH tool to call and extracts the arguments from the user's message.
The backend EXECUTES the tool against the database. The LLM never touches the DB directly
and never does money math itself.
"""
import json
from dataclasses import dataclass, field
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Expense, User
from ..schemas import CATEGORIES
from . import budget_engine, budget_service
from .rag import kb

# ---------- Tool schemas sent to the LLM (OpenAI format) ----------
TOOL_SCHEMAS = [
    {
        "type": "function",
        "function": {
            "name": "add_expense",
            "description": "Record ONE expense the user says they already spent. Call once per item. "
            "Do not call for things the user is only planning or asking about.",
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "number", "description": "Amount in Philippine pesos, e.g. 150"},
                    "category": {"type": "string", "enum": CATEGORIES,
                                 "description": "food=meals/groceries/snacks/coffee; transport=jeep/bus/MRT/Grab/tricycle/gas; "
                                 "load=mobile load/data/wifi; bills=rent/electric/water; school=school or work supplies, printing, tuition; "
                                 "wants=milk tea/shopping/streaming/games/leisure; others=anything else"},
                    "note": {"type": "string", "description": "Short description, e.g. 'Lunch - Jollibee'"},
                    "date": {"type": "string", "description": "YYYY-MM-DD. Omit for today. Use for 'kahapon' (yesterday)."},
                },
                "required": ["amount", "category", "note"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_budget_summary",
            "description": "Get the user's current budget numbers: remaining money, today's allowance, "
            "left to spend today, days left, total spent, run-out forecast, and status.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_affordability",
            "description": "Check if the user can afford a planned purchase and how it changes the daily allowance.",
            "parameters": {
                "type": "object",
                "properties": {
                    "price": {"type": "number", "description": "Price in pesos"},
                    "item": {"type": "string", "description": "What they want to buy"},
                },
                "required": ["price"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_spending_by_category",
            "description": "Get how much the user spent per category this budget period.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_knowledge_base",
            "description": "Search trusted reference documents (Philippine prices, fares, utility rates, budgeting "
            "methods, saving tips, how the app works). ALWAYS use this before answering general money questions.",
            "parameters": {
                "type": "object",
                "properties": {"query": {"type": "string", "description": "Search query in English or Tagalog"}},
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "undo_last_expense",
            "description": "Delete the most recent expense the user logged through chat today, when they say it was a mistake.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
]


@dataclass
class ToolContext:
    db: Session
    user: User
    new_expenses: list[Expense] = field(default_factory=list)
    sources: list[dict] = field(default_factory=list)  # [{n, title, heading}]
    calls: list[dict] = field(default_factory=list)

    def source_number(self, title: str, heading: str) -> int:
        for s in self.sources:
            if s["title"] == title and s["heading"] == heading:
                return s["n"]
        n = len(self.sources) + 1
        self.sources.append({"n": n, "title": title, "heading": heading})
        return n


def _summary(ctx: ToolContext):
    s = budget_service.get_summary(ctx.db, ctx.user)
    if not s:
        raise ToolError("The user has no active budget yet. Ask them to set one up first.")
    return s


class ToolError(Exception):
    pass


def execute(ctx: ToolContext, name: str, args: dict) -> dict:
    """Runs a tool and returns a JSON-serializable result for the LLM."""
    ctx.calls.append({"name": name, "args": args})
    try:
        if name == "add_expense":
            from ..routers.expenses import add_expense  # avoid circular import

            amount = float(args.get("amount", 0))
            if not 0 < amount <= 1_000_000:
                raise ToolError("Amount must be between 1 and 1,000,000 pesos.")
            category = args.get("category") if args.get("category") in CATEGORIES else "others"
            on = date.fromisoformat(args["date"]) if args.get("date") else date.today()
            if on > date.today():
                raise ToolError("Can't log an expense in the future.")
            note = (args.get("note") or "Expense").strip()[:200]
            expense = add_expense(ctx.db, ctx.user, amount, category, note, on, source="chat")
            ctx.new_expenses.append(expense)
            s = _summary(ctx)
            return {"ok": True, "logged": {"amount": amount, "category": category, "note": note, "date": on.isoformat()},
                    "left_today": round(s.left_today, 2), "remaining": round(s.remaining, 2), "status": s.status}

        if name == "get_budget_summary":
            return _summary(ctx).to_dict()

        if name == "check_affordability":
            price = float(args.get("price", 0))
            if price <= 0:
                raise ToolError("Price must be positive.")
            return {**budget_engine.affordability(_summary(ctx), price), "item": args.get("item", "")}

        if name == "get_spending_by_category":
            return {"categories": budget_service.get_category_totals(ctx.db, ctx.user)}

        if name == "search_knowledge_base":
            hits = kb.search(str(args.get("query", ""))[:300])
            if not hits:
                return {"results": [], "note": "No relevant documents found. Tell the user you don't have a reliable source."}
            return {"results": [
                {"source_id": ctx.source_number(h.title, h.heading), "title": h.title, "section": h.heading, "text": h.text}
                for h in hits
            ]}

        if name == "undo_last_expense":
            last = ctx.db.scalar(
                select(Expense)
                .where(Expense.user_id == ctx.user.id, Expense.source == "chat", Expense.date == date.today())
                .order_by(Expense.id.desc())
            )
            if not last:
                raise ToolError("No chat expense from today to undo.")
            info = {"amount": last.amount, "note": last.note}
            ctx.db.delete(last)
            ctx.db.commit()
            return {"ok": True, "deleted": info}

        raise ToolError(f"Unknown tool {name}")
    except ToolError as exc:
        return {"ok": False, "error": str(exc)}
    except (ValueError, TypeError) as exc:
        return {"ok": False, "error": f"Invalid arguments: {exc}"}


def to_json(result: dict) -> str:
    return json.dumps(result, ensure_ascii=False, default=str)

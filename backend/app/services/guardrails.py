"""
Guardrails (rubric: Governance, Security & Guardrails — 15%)

INPUT  (before anything reaches the LLM or the database)
  1. PII redaction     — card numbers, PH mobile numbers, emails are masked
  2. Prompt injection  — attempts to override rules / reveal the system prompt are blocked
  3. Scope check       — investment, crypto, loans, gambling are refused

OUTPUT (before the reply reaches the user)
  4. PII re-check      — mask anything the model may echo back
  5. Canary check      — if the secret canary from the system prompt leaks, the reply is replaced
"""
import re
from dataclasses import dataclass, field

# 13–19 digits, optionally separated by spaces/dashes; starts and ends on a digit
CARD_RE = re.compile(r"\b\d(?:[ -]?\d){12,18}\b")
# PH mobile: 09XXXXXXXXX or +639XXXXXXXXX
PHONE_RE = re.compile(r"(?<!\d)(?:\+?63|0)9\d{2}[ -]?\d{3}[ -]?\d{4}(?!\d)")
EMAIL_RE = re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b")

INJECTION_PATTERNS = [
    r"ignore (all |any |your |the )?(previous |prior |above )?(rules|instructions|prompts?)",
    r"disregard (all |your |the )?(rules|instructions)",
    r"(reveal|show|print|repeat|leak).{0,20}(system prompt|instructions|rules)",
    r"\bsystem prompt\b",
    r"you are now\b",
    r"\bact as (an? )?(?!budget)",
    r"developer mode|jailbreak|\bDAN\b",
    r"set my budget to",
    r"pretend (to be|you are)",
    r"kalimutan mo (ang|yung) (rules|instructions)",
]
INJECTION_RE = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)

OFF_LIMITS_RE = re.compile(
    r"\b(invest(ing|ment)?|crypto|bitcoin|btc|ethereum|stocks?|forex|trading|mutual fund|uitf"
    r"|sabong|e-?sabong|casino|sugal|bet(ting)?|online games? (na )?may pera|lotto"
    r"|loan app|online lending|utang sa app|pautang)\b",
    re.IGNORECASE,
)

CANARY = "CB-CANARY-7731"  # embedded in the system prompt; must never appear in output


@dataclass
class GuardResult:
    clean_text: str
    flags: list[str] = field(default_factory=list)

    @property
    def blocked(self) -> bool:
        return "injection" in self.flags

    @property
    def refused(self) -> bool:
        return "off_limits" in self.flags


def mask_pii(text: str) -> tuple[str, bool]:
    found = False

    def card(m: re.Match) -> str:
        nonlocal found
        found = True
        digits = re.sub(r"\D", "", m.group())
        return "**** **** **** " + digits[-4:]

    def phone(m: re.Match) -> str:
        nonlocal found
        found = True
        digits = re.sub(r"\D", "", m.group())
        return "09** *** **" + digits[-2:]

    def email(m: re.Match) -> str:
        nonlocal found
        found = True
        user, _, domain = m.group().partition("@")
        return f"{user[0]}***@{domain}"

    text = CARD_RE.sub(card, text)
    text = PHONE_RE.sub(phone, text)
    text = EMAIL_RE.sub(email, text)
    return text, found


def check_input(text: str) -> GuardResult:
    clean, had_pii = mask_pii(text.strip())
    flags = []
    if had_pii:
        flags.append("pii")
    if INJECTION_RE.search(clean):
        flags.append("injection")
    if OFF_LIMITS_RE.search(clean):
        flags.append("off_limits")
    return GuardResult(clean_text=clean, flags=flags)


def check_output(reply: str) -> str:
    if CANARY in reply:
        return "Sorry, I can't share that. I can help you with your budget and expenses instead."
    masked, _ = mask_pii(reply)
    return masked


BLOCKED_REPLY = (
    "Sorry, hindi ko pwedeng baguhin ang rules ko o ang budget mo dito sa chat. "
    "Pwede mong i-edit ang budget mo anytime sa Settings."
)
REFUSED_REPLY = (
    "Sorry, hindi ako pwedeng magbigay ng advice about investing, crypto, loans, o gambling. Budgeting assistant ako, "
    "hindi licensed financial advisor. Pero matutulungan kitang i-plan ang gastos at savings mo!"
)

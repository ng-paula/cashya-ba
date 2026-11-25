"""
Workflow automation — alerts + outgoing webhook (Documentation Section 10)

  [User logs expense (form or AI chat)] → [Budget engine] → [Threshold crossed?]
      → [Saved as in-app notification (bell)] + [POST JSON to WEBHOOK_URL]

Events:
  budget_threshold  — 50% / 80% / 100% of the budget used (sent once per threshold per period)
  runout_warning    — forecast says money won't last until the next baon/sahod
  daily_digest      — today's allowance, created on the first app visit of the day
  test              — "Send test alert" in Settings

Every event is stored in automation_events (that table is also the notification feed).
If WEBHOOK_URL is empty, the event is still stored with status "skipped".
"""
import logging

import httpx
from sqlalchemy.orm import Session

from ..config import settings
from ..models import AutomationEvent, Budget, User
from .budget_engine import BudgetSummary

log = logging.getLogger(__name__)

THRESHOLDS = [50, 80, 100]
DEFAULT_PREFS = {"morning": True, "warn50": True, "warn80": True, "runout": True, "nolog": False, "weekly": True}


def prefs(user: User) -> dict:
    return {**DEFAULT_PREFS, **(user.alert_prefs or {})}


def webhook_url() -> str:
    return settings.webhook_url or settings.n8n_webhook_url


def send_event(db: Session, user: User | None, event: str, payload: dict) -> AutomationEvent:
    body = {"event": event, "user": {"id": user.id, "name": user.full_name} if user else None, **payload}
    status = "skipped"
    url = webhook_url()
    if url:
        try:
            r = httpx.post(url, json=body, timeout=5)
            status = "sent" if r.is_success else "failed"
        except httpx.HTTPError as exc:  # a down receiver must never break the app
            log.warning("webhook failed: %s", exc)
            status = "failed"
    ev = AutomationEvent(user_id=user.id if user else None, event=event, payload=body, status=status)
    db.add(ev)
    db.commit()
    return ev


def check_budget_alerts(db: Session, user: User, budget: Budget, summary: BudgetSummary) -> list[str]:
    """Call after an expense is added. Returns the events that fired."""
    fired: list[str] = []
    p = prefs(user)
    sent = list(budget.alerts_sent or [])

    for t in THRESHOLDS:
        key = f"pct{t}"
        enabled = p.get("warn50") if t == 50 else p.get("warn80")  # 80 and 100 share the 80% toggle
        if summary.percent_used >= t and key not in sent and enabled:
            send_event(db, user, "budget_threshold", {
                "threshold": t,
                "percentUsed": round(summary.percent_used, 1),
                "remaining": round(summary.remaining, 2),
                "daysLeft": summary.days_left,
                "suggestedDaily": round(max(summary.remaining, 0) / summary.days_left, 2),
                "message": (f"You've used all of your budget." if t >= 100 else f"You've used {t}% of your budget.")
                + f" ₱{max(summary.remaining, 0):,.0f} left for {summary.days_left} day(s).",
            })
            sent.append(key)
            fired.append(key)

    if not summary.will_last and "runout" not in sent and p.get("runout"):
        send_event(db, user, "runout_warning", {
            "runOutDay": summary.run_out_day,
            "runOutDate": summary.run_out_date,
            "avgDaily": round(summary.avg_daily, 2),
            "message": f"At ₱{summary.avg_daily:,.0f}/day, your money runs out on Day {summary.run_out_day}. Try to stay under ₱{summary.today_allowance:,.0f}/day.",
        })
        sent.append("runout")
        fired.append("runout")

    if fired:
        budget.alerts_sent = sent
        db.commit()
    return fired


def digest_message(user: User, summary: BudgetSummary) -> str:
    status = {"kasya": "On track", "tight": "Getting tight", "hindi": "Won't last at this pace"}[summary.status]
    return (
        f"Good morning, {user.full_name.split()[0]}!\n"
        f"Today's allowance: ₱{summary.today_allowance:,.0f}\n"
        f"Remaining: ₱{summary.remaining:,.0f} for {summary.days_left} day(s)\n"
        f"Status: {status}"
    )

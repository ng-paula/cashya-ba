"""
In-app notifications (the bell in the top bar).

The feed is the same automation_events table the webhook writes to, so every alert
the user sees in the app is also the one that was POSTed to WEBHOOK_URL.
"""
from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AutomationEvent, User
from ..security import get_current_user
from ..services import automation, budget_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

SHOWN = ("budget_threshold", "runout_warning", "daily_digest", "test")


STATUS_TEXT = {"kasya": "You're on track.", "tight": "It's getting tight.", "hindi": "At this pace it won't last."}


def title_for(ev: AutomationEvent) -> str:
    p = ev.payload or {}
    if ev.event == "daily_digest" and "todayAllowance" in p:
        return f"Today's allowance: ₱{p['todayAllowance']:,.0f}"
    if ev.event == "budget_threshold":
        return "Budget used up" if p.get("threshold", 0) >= 100 else f"{p.get('threshold')}% of budget used"
    return {"runout_warning": "Money may run out early", "daily_digest": "Today's allowance", "test": "Test alert"}.get(ev.event, ev.event)


def message_for(ev: AutomationEvent) -> str:
    """Short text for the bell; the webhook still gets the full message."""
    p = ev.payload or {}
    if ev.event == "daily_digest" and "remaining" in p:
        days = p.get("daysLeft", 0)
        text = f"₱{p['remaining']:,.0f} left for {days} day{'s' if days != 1 else ''}."
        return f"{text} {STATUS_TEXT[p['status']]}" if p.get("status") in STATUS_TEXT else text
    return p.get("message", "")


def tone_for(ev: AutomationEvent) -> str:
    t = (ev.payload or {}).get("threshold", 0)
    if ev.event == "runout_warning" or t >= 100:
        return "red"
    if t >= 80:
        return "amber"
    return "green" if ev.event == "daily_digest" else "neutral"


def ensure_daily_digest(db: Session, user: User) -> None:
    """First visit of the day → one 'Today's allowance' alert (replaces the 7 AM scheduler)."""
    if not automation.prefs(user).get("morning"):
        return
    start = datetime.combine(date.today(), time.min)
    already = db.scalar(select(AutomationEvent.id).where(
        AutomationEvent.user_id == user.id, AutomationEvent.event == "daily_digest", AutomationEvent.created_at >= start))
    if already:
        return
    summary = budget_service.get_summary(db, user)
    if not summary:
        return
    automation.send_event(db, user, "daily_digest", {
        "todayAllowance": round(summary.today_allowance, 2),
        "remaining": round(summary.remaining, 2),
        "daysLeft": summary.days_left,
        "status": summary.status,
        "message": automation.digest_message(user, summary).replace("!\n", "! ").replace("\n", " · "),
    })


@router.get("")
def list_notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ensure_daily_digest(db, user)
    events = db.scalars(
        select(AutomationEvent)
        .where(AutomationEvent.user_id == user.id, AutomationEvent.event.in_(SHOWN))
        .order_by(AutomationEvent.id.desc())
        .limit(20)
    )
    return [
        {
            "id": ev.id,
            "event": ev.event,
            "tone": tone_for(ev),
            "title": title_for(ev),
            "message": message_for(ev),
            "createdAt": ev.created_at.isoformat(),
            "read": ev.read_at is not None,
            "webhook": ev.status,
        }
        for ev in events
    ]


def _unread(user: User):
    return (AutomationEvent.user_id == user.id, AutomationEvent.event.in_(SHOWN), AutomationEvent.read_at.is_(None))


@router.post("/read-all", status_code=204)
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(AutomationEvent).where(*_unread(user)).values(read_at=datetime.now()))
    db.commit()


@router.post("/{event_id}/read", status_code=204)
def mark_read(event_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    ev = db.get(AutomationEvent, event_id)
    if not ev or ev.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Alert not found")
    if ev.read_at is None:
        ev.read_at = datetime.now()
        db.commit()

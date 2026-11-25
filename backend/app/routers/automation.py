"""
Endpoints that n8n calls on a schedule (protected by X-Automation-Key, not a user login).

  GET  /api/automation/daily-digest   → n8n Cron (7:00 AM) → loop users → send Telegram/email
  POST /api/automation/test           → admin-triggered test event
"""
from datetime import date

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Expense, User
from ..security import require_roles
from ..services import automation, budget_service

router = APIRouter(prefix="/api/automation", tags=["automation"])


def check_key(x_automation_key: str = Header(default="")):
    if x_automation_key != settings.automation_api_key:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid automation key")


@router.get("/daily-digest", dependencies=[Depends(check_key)])
def daily_digest(kind: str = "morning", db: Session = Depends(get_db)):
    """kind=morning → allowance for today; kind=nolog → users who logged nothing today"""
    out = []
    for user in db.scalars(select(User)):
        prefs = automation.prefs(user)
        if not prefs.get(kind):
            continue
        summary = budget_service.get_summary(db, user)
        if not summary:
            continue
        if kind == "nolog":
            logged = db.scalar(select(Expense.id).where(Expense.user_id == user.id, Expense.date == date.today()))
            if logged:
                continue
            message = f"Hi {user.full_name.split()[0]}! You haven't logged any expenses today. Did you spend anything?"
        else:
            message = automation.digest_message(user, summary)
        out.append({"userId": user.id, "name": user.full_name, "telegramChatId": user.telegram_chat_id,
                    "email": user.email, "message": message})
    return {"date": date.today().isoformat(), "count": len(out), "items": out}


@router.post("/test")
def send_test(user: User = Depends(require_roles("admin", "user", "parent", "child")), db: Session = Depends(get_db)):
    ev = automation.send_event(db, user, "test", {"message": "Test alert from Cashya Ba?"})
    return {"status": ev.status, "webhookConfigured": bool(automation.webhook_url())}

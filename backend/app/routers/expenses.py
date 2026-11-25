"""Expenses CRUD. Adding an expense also checks budget alerts (→ n8n webhook)."""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Expense, User
from ..schemas import ExpenseIn, ExpenseOut
from ..security import get_current_user
from ..services import automation, budget_service

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def add_expense(db: Session, user: User, amount: float, category: str, note: str,
                on: date | None = None, source: str = "manual") -> Expense:
    """Shared by the REST endpoint and the AI's add_expense tool"""
    expense = Expense(user_id=user.id, date=on or date.today(), amount=round(amount, 2),
                      category=category, note=note[:200], source=source)
    db.add(expense)
    db.commit()
    db.refresh(expense)

    budget = budget_service.active_budget(db, user)
    if budget:
        summary = budget_service.get_summary(db, user)
        automation.check_budget_alerts(db, user, budget, summary)
    return expense


@router.get("", response_model=list[ExpenseOut])
def list_expenses(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    budget = budget_service.active_budget(db, user)
    if not budget:
        return []
    return budget_service.period_expenses(db, user, budget)


@router.post("", response_model=ExpenseOut, status_code=201)
def create(data: ExpenseIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.date and data.date > date.today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Date can't be in the future")
    return add_expense(db, user, data.amount, data.category, data.note.strip(), data.date)


@router.delete("/{expense_id}", status_code=204)
def delete(expense_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    expense = db.scalar(select(Expense).where(Expense.id == expense_id, Expense.user_id == user.id))
    if not expense:  # also blocks deleting someone else's expense
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Expense not found")
    db.delete(expense)
    db.commit()

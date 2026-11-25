"""Database helpers around the budget engine (shared by routers and AI tools)"""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Budget, Expense, User
from . import budget_engine


def active_budget(db: Session, user: User) -> Budget | None:
    return db.scalar(
        select(Budget).where(Budget.user_id == user.id, Budget.is_active.is_(True)).order_by(Budget.id.desc())
    )


def period_expenses(db: Session, user: User, budget: Budget) -> list[Expense]:
    return list(
        db.scalars(
            select(Expense)
            .where(Expense.user_id == user.id, Expense.date >= budget.start_date, Expense.date <= budget.end_date)
            .order_by(Expense.date, Expense.id)
        )
    )


def get_summary(db: Session, user: User, today: date | None = None) -> budget_engine.BudgetSummary | None:
    budget = active_budget(db, user)
    if not budget:
        return None
    expenses = period_expenses(db, user, budget)
    return budget_engine.summarize(
        budget.type,
        budget.amount,
        budget.start_date,
        budget.end_date,
        sum(f.amount for f in budget.fixed_expenses),
        [(e.date, e.amount) for e in expenses],
        today=today,
    )


def get_category_totals(db: Session, user: User) -> list[dict]:
    budget = active_budget(db, user)
    if not budget:
        return []
    return budget_engine.category_totals([(e.category, e.amount) for e in period_expenses(db, user, budget)])

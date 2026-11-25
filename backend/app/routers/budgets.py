"""Budget periods + summary.  Children (household mode) cannot set their own budget."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Budget, FixedExpense, User
from ..schemas import BudgetIn, BudgetOut
from ..security import get_current_user, require_roles
from ..services import budget_service

router = APIRouter(prefix="/api/budget", tags=["budget"])


def create_budget_for(db: Session, owner: User, data: BudgetIn) -> Budget:
    if data.end_date < data.start_date:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "End date must be after start date")
    if (data.end_date - data.start_date).days > 92:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A budget period can be at most 3 months")
    fixed_total = sum(f.amount for f in data.fixed_expenses)
    if fixed_total >= data.amount:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Fixed expenses are larger than the budget")

    for old in owner.budgets:
        old.is_active = False
    budget = Budget(
        user_id=owner.id,
        type=data.type,
        amount=data.amount,
        start_date=data.start_date,
        end_date=data.end_date,
        fixed_expenses=[FixedExpense(name=f.name, amount=f.amount) for f in data.fixed_expenses],
    )
    db.add(budget)
    db.commit()
    db.refresh(budget)
    return budget


@router.get("", response_model=BudgetOut | None)
def get_active(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return budget_service.active_budget(db, user)


@router.post("", response_model=BudgetOut, status_code=201)
def create(data: BudgetIn, user: User = Depends(require_roles("user", "parent", "admin")), db: Session = Depends(get_db)):
    return create_budget_for(db, user, data)


@router.get("/summary")
def summary(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = budget_service.get_summary(db, user)
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No active budget")
    return {**s.to_dict(), "categories": budget_service.get_category_totals(db, user)}

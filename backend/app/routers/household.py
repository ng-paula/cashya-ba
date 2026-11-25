"""
Household mode (RBAC demo):
  parent → can link a child account, set the child's baon, and see the child's summary
  child  → can log expenses but cannot create or change a budget
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import EmailStr
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import BudgetIn, BudgetOut, CamelModel
from ..security import require_roles
from ..services import budget_service
from .budgets import create_budget_for

router = APIRouter(prefix="/api/household", tags=["household"])


class LinkChildIn(CamelModel):
    child_email: EmailStr


def own_child(db: Session, parent: User, child_id: int) -> User:
    child = db.scalar(select(User).where(User.id == child_id, User.parent_id == parent.id))
    if not child:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Child not linked to your account")
    return child


@router.get("")
def list_children(parent: User = Depends(require_roles("parent")), db: Session = Depends(get_db)):
    children = db.scalars(select(User).where(User.parent_id == parent.id))
    out = []
    for c in children:
        s = budget_service.get_summary(db, c)
        out.append({"id": c.id, "fullName": c.full_name, "email": c.email, "summary": s.to_dict() if s else None})
    return out


@router.post("/link", status_code=201)
def link_child(data: LinkChildIn, parent: User = Depends(require_roles("parent")), db: Session = Depends(get_db)):
    child = db.scalar(select(User).where(User.email == data.child_email.lower()))
    if not child or child.id == parent.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No account with that email")
    if child.role in ("admin", "parent"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That account can't be linked as a child")
    child.parent_id = parent.id
    child.role = "child"
    db.commit()
    return {"id": child.id, "fullName": child.full_name}


@router.post("/{child_id}/budget", response_model=BudgetOut, status_code=201)
def set_child_budget(child_id: int, data: BudgetIn, parent: User = Depends(require_roles("parent")), db: Session = Depends(get_db)):
    return create_budget_for(db, own_child(db, parent, child_id), data)

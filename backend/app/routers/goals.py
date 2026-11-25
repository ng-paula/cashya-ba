"""Savings goals"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Goal, User
from ..schemas import GoalDeposit, GoalIn, GoalOut
from ..security import get_current_user

router = APIRouter(prefix="/api/goals", tags=["goals"])


def own_goal(db: Session, user: User, goal_id: int) -> Goal:
    goal = db.scalar(select(Goal).where(Goal.id == goal_id, Goal.user_id == user.id))
    if not goal:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Goal not found")
    return goal


@router.get("", response_model=list[GoalOut])
def list_goals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return list(db.scalars(select(Goal).where(Goal.user_id == user.id).order_by(Goal.due)))


@router.post("", response_model=GoalOut, status_code=201)
def create(data: GoalIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = Goal(user_id=user.id, name=data.name.strip(), emoji=data.emoji[:8], target=data.target, due=data.due)
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return goal


@router.post("/{goal_id}/deposit", response_model=GoalOut)
def deposit(goal_id: int, data: GoalDeposit, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    goal = own_goal(db, user, goal_id)
    goal.saved = min(goal.saved + data.amount, goal.target)
    db.commit()
    return goal


@router.delete("/{goal_id}", status_code=204)
def delete(goal_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(own_goal(db, user, goal_id))
    db.commit()

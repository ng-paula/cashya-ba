"""POST /api/auth/register, POST /api/auth/login, GET/PATCH /api/auth/me, POST /api/auth/password"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..schemas import LoginIn, PasswordChangeIn, RegisterIn, TokenOut, UserOut, UserUpdate
from ..security import create_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenOut, status_code=201)
def register(data: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == data.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    # New sign-ups are always plain users; roles are assigned by an admin (RBAC)
    user = User(email=data.email.lower(), full_name=data.full_name.strip(), password_hash=hash_password(data.password), role="user")
    db.add(user)
    db.commit()
    return TokenOut(token=create_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == data.email.lower()))
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong email or password")
    return TokenOut(token=create_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/password", status_code=204)
def change_password(data: PasswordChangeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Your current password is incorrect")
    if data.new_password == data.current_password:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick a new password that's different from your current one")
    user.password_hash = hash_password(data.new_password)
    db.commit()


@router.patch("/me", response_model=UserOut)
def update_me(data: UserUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.full_name is not None:
        user.full_name = data.full_name.strip()
    if data.alert_prefs is not None:
        user.alert_prefs = {**(user.alert_prefs or {}), **data.alert_prefs}
    if data.telegram_chat_id is not None:
        user.telegram_chat_id = data.telegram_chat_id.strip() or None
    db.commit()
    return user

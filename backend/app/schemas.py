"""Request / response shapes (Pydantic). JSON uses camelCase to match the React frontend."""
from datetime import date as Date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel

CATEGORIES = ["food", "transport", "load", "bills", "school", "wants", "others"]
Category = Literal["food", "transport", "load", "bills", "school", "wants", "others"]
Role = Literal["user", "parent", "child", "admin"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# ---------- Auth ----------
class RegisterIn(CamelModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    password: str = Field(min_length=8, max_length=128)


class PasswordChangeIn(CamelModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class LoginIn(CamelModel):
    email: EmailStr
    password: str


class UserOut(CamelModel):
    id: int
    email: str
    full_name: str
    role: Role
    alert_prefs: dict = {}
    telegram_chat_id: str | None = None


class TokenOut(CamelModel):
    token: str
    user: UserOut


class UserUpdate(CamelModel):
    full_name: str | None = None
    alert_prefs: dict | None = None
    telegram_chat_id: str | None = None


# ---------- Budget ----------
class FixedExpenseIn(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    amount: float = Field(gt=0, le=10_000_000)


class BudgetIn(CamelModel):
    type: Literal["baon", "sahod"]
    amount: float = Field(gt=0, le=10_000_000)
    start_date: Date
    end_date: Date
    fixed_expenses: list[FixedExpenseIn] = []


class FixedExpenseOut(CamelModel):
    name: str
    amount: float


class BudgetOut(CamelModel):
    id: int
    type: str
    amount: float
    start_date: Date
    end_date: Date
    fixed_expenses: list[FixedExpenseOut]


# ---------- Expenses ----------
class ExpenseIn(CamelModel):
    amount: float = Field(gt=0, le=1_000_000)
    category: Category
    note: str = Field(min_length=1, max_length=200)
    date: Date | None = None


class ExpenseOut(CamelModel):
    id: int
    date: Date
    amount: float
    category: str
    note: str
    source: str


# ---------- Goals ----------
class GoalIn(CamelModel):
    name: str = Field(min_length=1, max_length=120)
    emoji: str = "🎯"
    target: float = Field(gt=0, le=10_000_000)
    due: Date


class GoalOut(CamelModel):
    id: int
    name: str
    emoji: str
    target: float
    saved: float
    due: Date


class GoalDeposit(CamelModel):
    amount: float = Field(gt=0, le=10_000_000)


# ---------- Chat ----------
class ChatIn(CamelModel):
    message: str = Field(min_length=1, max_length=1000)


class ToolCallOut(CamelModel):
    name: str
    args: dict


class ChatOut(CamelModel):
    reply: str
    clean_text: str
    flags: list[str]
    tool_calls: list[ToolCallOut]
    sources: list[str]
    new_expenses: list[ExpenseOut]
    mode: Literal["llm", "rules"]
    latency_ms: int


class ChatHistoryItem(CamelModel):
    id: int
    role: str
    content: str
    meta: dict
    created_at: datetime


# ---------- Admin ----------
class KBDocumentOut(CamelModel):
    id: int
    title: str
    file_type: str
    status: str
    chunks: int
    updated_at: datetime

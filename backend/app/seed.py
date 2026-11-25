"""
Demo data for development and the capstone defense.

Demo accounts (password for all: cashya123)
  juan@cashya.demo   — user   (sahod, ₱10,000 for 15 days, day 7)
  maria@cashya.demo  — parent (linked to Ben)
  ben@cashya.demo    — child  (₱1,500 weekly baon set by Maria)
  admin@cashya.demo  — admin
"""
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Budget, Expense, FixedExpense, Goal, User
from .security import hash_password

DEMO_PASSWORD = "cashya123"


def seed(db: Session) -> bool:
    if db.scalar(select(User.id).limit(1)):
        return False  # already has data

    pw = hash_password(DEMO_PASSWORD)
    today = date.today()

    juan = User(email="juan@cashya.demo", full_name="Juan Dela Cruz", password_hash=pw, role="user")
    maria = User(email="maria@cashya.demo", full_name="Maria Santos", password_hash=pw, role="parent")
    admin = User(email="admin@cashya.demo", full_name="System Admin", password_hash=pw, role="admin")
    db.add_all([juan, maria, admin])
    db.flush()
    ben = User(email="ben@cashya.demo", full_name="Ben Santos", password_hash=pw, role="child", parent_id=maria.id)
    db.add(ben)
    db.flush()

    # --- Juan: sahod, day 7 of 15 ---
    start = today - timedelta(days=6)
    db.add(Budget(user_id=juan.id, type="sahod", amount=10000, start_date=start, end_date=start + timedelta(days=14),
                  fixed_expenses=[FixedExpense(name="Bedspace rent (share)", amount=2000),
                                  FixedExpense(name="Load promo", amount=299)]))
    rows = [
        (0, 150, "food", "Lunch - carinderia"), (0, 52, "transport", "Jeep papunta at pauwi"), (0, 120, "wants", "Milk tea"),
        (1, 165, "food", "Jollibee chickenjoy"), (1, 52, "transport", "Jeep"), (1, 95, "food", "Merienda"),
        (2, 140, "food", "Lunch"), (2, 180, "transport", "Grab (umuulan)"), (2, 60, "school", "Photocopy & print"),
        (3, 150, "food", "Lunch"), (3, 52, "transport", "Jeep"), (3, 349, "wants", "Shopee - phone case"),
        (4, 130, "food", "Lunch"), (4, 52, "transport", "Jeep"), (4, 210, "food", "Dinner with friends"),
        (5, 260, "food", "Groceries - sari-sari"), (5, 52, "transport", "Jeep"), (5, 140, "wants", "Milk tea"),
        (6, 145, "food", "Lunch - Mang Inasal"), (6, 26, "transport", "Jeep"),
    ]
    db.add_all([Expense(user_id=juan.id, date=start + timedelta(days=d), amount=a, category=c, note=n) for d, a, c, n in rows])
    db.add_all([
        Goal(user_id=juan.id, name="Concert ticket", emoji="🎤", target=3500, saved=2100, due=today + timedelta(days=40)),
        Goal(user_id=juan.id, name="Emergency fund", emoji="🛟", target=5000, saved=1250, due=today + timedelta(days=90)),
        Goal(user_id=juan.id, name="New shoes", emoji="👟", target=1800, saved=1620, due=today + timedelta(days=14)),
    ])

    # --- Ben: weekly baon set by parent ---
    bstart = today - timedelta(days=2)
    db.add(Budget(user_id=ben.id, type="baon", amount=1500, start_date=bstart, end_date=bstart + timedelta(days=6)))
    db.add_all([
        Expense(user_id=ben.id, date=bstart, amount=60, category="food", note="Recess"),
        Expense(user_id=ben.id, date=bstart, amount=26, category="transport", note="Jeep"),
        Expense(user_id=ben.id, date=bstart + timedelta(days=1), amount=85, category="food", note="Lunch"),
        Expense(user_id=ben.id, date=bstart + timedelta(days=1), amount=50, category="load", note="Load"),
    ])

    # --- Maria: her own sahod budget ---
    mstart = today - timedelta(days=3)
    db.add(Budget(user_id=maria.id, type="sahod", amount=18000, start_date=mstart, end_date=mstart + timedelta(days=14),
                  fixed_expenses=[FixedExpense(name="Meralco", amount=2500), FixedExpense(name="Tubig", amount=600)]))

    db.commit()
    return True

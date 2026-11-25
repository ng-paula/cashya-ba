"""Unit tests for the deterministic money math."""
from datetime import date, timedelta

from app.services.budget_engine import affordability, category_totals, summarize

START = date(2026, 11, 1)
END = START + timedelta(days=14)  # 15 days


def test_daily_allowance_on_day_one():
    s = summarize("sahod", 10000, START, END, 2500, [], today=START)
    assert s.spendable == 7500
    assert s.total_days == 15
    assert s.today_allowance == 500
    assert s.status == "kasya"


def test_underspending_raises_tomorrows_allowance():
    expenses = [(START, 300)]  # spent 300 of 500 on day 1
    s = summarize("sahod", 10000, START, END, 2500, expenses, today=START + timedelta(days=1))
    assert round(s.today_allowance, 2) == round(7200 / 14, 2)  # > 500
    assert s.today_allowance > 500


def test_overspending_today_is_hindi_kasya():
    s = summarize("baon", 1000, START, START + timedelta(days=4), 0, [(START, 450)], today=START)
    assert s.left_today < 0
    assert s.status == "hindi"


def test_runout_forecast():
    # 1000 per day on a 500/day plan → money lasts ~7 days of 15
    expenses = [(START + timedelta(days=i), 1000) for i in range(3)]
    s = summarize("sahod", 7500, START, END, 0, expenses, today=START + timedelta(days=3))
    assert not s.will_last
    assert s.run_out_day == 7


def test_expenses_outside_period_are_ignored():
    s = summarize("sahod", 5000, START, END, 0, [(START - timedelta(days=1), 999)], today=START)
    assert s.total_spent == 0


def test_affordability():
    s = summarize("sahod", 7500, START, END, 0, [], today=START)
    assert affordability(s, 500)["affordable"] is True
    assert affordability(s, 6000)["affordable"] is False


def test_category_totals_sorted():
    rows = category_totals([("food", 100), ("wants", 300), ("food", 50)])
    assert rows[0]["category"] == "wants"
    assert rows[1]["total"] == 150

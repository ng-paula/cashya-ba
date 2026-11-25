"""
Budget engine — deterministic money math (NO AI here).

The LLM never calculates amounts. It calls tools (get_budget_summary,
check_affordability) that use these functions, so numbers can't be hallucinated.
Same formulas as frontend/src/utils/budget.js.
"""
from dataclasses import asdict, dataclass
from datetime import date, timedelta


@dataclass
class BudgetSummary:
    type: str
    fixed_total: float
    spendable: float
    total_days: int
    day_number: int
    days_left: int
    total_spent: float
    spent_today: float
    remaining: float
    today_allowance: float
    left_today: float
    original_daily: float
    avg_daily: float
    run_out_day: int
    run_out_date: str
    will_last: bool
    percent_used: float
    status: str  # kasya | tight | hindi

    def to_dict(self) -> dict:
        return {k: round(v, 2) if isinstance(v, float) else v for k, v in asdict(self).items()}


def summarize(budget_type: str, amount: float, start: date, end: date, fixed_total: float,
              expenses: list[tuple[date, float]], today: date | None = None) -> BudgetSummary:
    """expenses: list of (date, amount) for this user"""
    today = today or date.today()
    spendable = amount - fixed_total

    total_days = (end - start).days + 1
    day_number = min(max((today - start).days + 1, 1), total_days)
    days_left = max(total_days - day_number + 1, 1)  # includes today

    in_period = [(d, a) for d, a in expenses if start <= d <= end]
    total_spent = sum(a for _, a in in_period)
    spent_today = sum(a for d, a in in_period if d == today)
    spent_before_today = total_spent - spent_today
    remaining = spendable - total_spent

    # Allowance is fixed at the start of the day; today's spending eats into it
    today_allowance = (spendable - spent_before_today) / days_left
    left_today = today_allowance - spent_today
    original_daily = spendable / total_days

    # Forecast: at the average pace so far, on which day does the money run out?
    days_elapsed = max(day_number - 1, 1)
    avg_daily = spent_before_today / days_elapsed if spent_before_today > 0 else original_daily
    # small epsilon: float floor-division gives 13 for 1000 // (1000/14)
    days_money_lasts = int(spendable / avg_daily + 1e-9) if avg_daily > 0 else total_days
    run_out_day = min(days_money_lasts, total_days + 30)
    will_last = days_money_lasts >= total_days
    run_out_date = start + timedelta(days=max(run_out_day - 1, 0))

    status = "kasya"
    if left_today < 0 or not will_last:
        status = "hindi"
    elif today_allowance < original_daily * 0.85:
        status = "tight"

    return BudgetSummary(
        type=budget_type,
        fixed_total=fixed_total,
        spendable=spendable,
        total_days=total_days,
        day_number=day_number,
        days_left=days_left,
        total_spent=total_spent,
        spent_today=spent_today,
        remaining=remaining,
        today_allowance=today_allowance,
        left_today=left_today,
        original_daily=original_daily,
        avg_daily=avg_daily,
        run_out_day=run_out_day,
        run_out_date=run_out_date.isoformat(),
        will_last=will_last,
        percent_used=min(total_spent / spendable * 100, 100) if spendable > 0 else 0,
        status=status,
    )


def affordability(summary: BudgetSummary, price: float) -> dict:
    """'Can I afford it?' — effect of a purchase on the remaining daily allowance"""
    remaining_after = summary.remaining - price
    days_after_today = max(summary.days_left - 1, 1)
    new_daily = remaining_after / days_after_today
    return {
        "price": price,
        "remaining_after": round(remaining_after, 2),
        "new_daily_allowance": round(new_daily, 2),
        "planned_daily": round(summary.original_daily, 2),
        "affordable": remaining_after > 0 and new_daily >= summary.original_daily * 0.6,
    }


def category_totals(expenses: list[tuple[str, float]]) -> list[dict]:
    """expenses: list of (category, amount)"""
    totals: dict[str, float] = {}
    for cat, amt in expenses:
        totals[cat] = totals.get(cat, 0) + amt
    grand = sum(totals.values()) or 1
    rows = [{"category": c, "total": round(t, 2), "percent": round(t / grand * 100, 1)} for c, t in totals.items()]
    return sorted(rows, key=lambda r: r["total"], reverse=True)

/* ==========================================================
   Budget engine (deterministic — NO AI here)
   All money math lives in code so the LLM never computes
   amounts itself. The AI only reads these results through
   function calls (e.g. get_remaining_budget).
   ========================================================== */

const DAY_MS = 24 * 60 * 60 * 1000;

/** 'YYYY-MM-DD' for a Date in local time */
export function toISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, n) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + n);
  return toISODate(date);
}

/** Whole days from a to b (b - a) */
export function daysBetween(aIso, bIso) {
  return Math.round((parseISODate(bIso) - parseISODate(aIso)) / DAY_MS);
}

export function todayISO() {
  return toISODate(new Date());
}

export function formatPeso(value, { decimals = 0 } = {}) {
  const sign = value < 0 ? '-' : '';
  return (
    sign +
    '₱' +
    Math.abs(value).toLocaleString('en-PH', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
  );
}

export function formatDate(iso, opts = { month: 'short', day: 'numeric' }) {
  return parseISODate(iso).toLocaleDateString('en-PH', opts);
}

/**
 * Main budget summary used by every screen.
 * @param {object} budget  { amount, startDate, endDate, fixedExpenses: [{name, amount}] }
 * @param {Array}  expenses [{ id, date, amount, category, note }]
 * @param {string} today   'YYYY-MM-DD'
 */
export function getBudgetSummary(budget, expenses, today = todayISO()) {
  const fixedTotal = budget.fixedExpenses.reduce((s, f) => s + f.amount, 0);
  const spendable = budget.amount - fixedTotal; // money for daily spending

  const totalDays = daysBetween(budget.startDate, budget.endDate) + 1;
  const dayNumber = Math.min(Math.max(daysBetween(budget.startDate, today) + 1, 1), totalDays);
  const daysLeft = Math.max(totalDays - dayNumber + 1, 1); // includes today

  const inPeriod = expenses.filter((e) => e.date >= budget.startDate && e.date <= budget.endDate);
  const totalSpent = inPeriod.reduce((s, e) => s + e.amount, 0);
  const spentToday = inPeriod.filter((e) => e.date === today).reduce((s, e) => s + e.amount, 0);
  const spentBeforeToday = totalSpent - spentToday;

  const remaining = spendable - totalSpent;

  // Allowance is fixed at the start of the day, then today's spending eats into it.
  const todayAllowance = (spendable - spentBeforeToday) / daysLeft;
  const leftToday = todayAllowance - spentToday;
  const originalDaily = spendable / totalDays;

  // Forecast: at the average pace so far, on which day does the money run out?
  const daysElapsed = Math.max(dayNumber - 1, 1);
  const avgDaily = spentBeforeToday > 0 ? spentBeforeToday / daysElapsed : originalDaily;
  const daysMoneyLasts = avgDaily > 0 ? Math.floor(spendable / avgDaily) : totalDays;
  const runOutDay = Math.min(daysMoneyLasts, totalDays + 30);
  const willLast = daysMoneyLasts >= totalDays;
  const runOutDate = addDays(budget.startDate, Math.max(runOutDay - 1, 0));

  let status = 'kasya';
  if (leftToday < 0 || !willLast) status = 'hindi';
  else if (todayAllowance < originalDaily * 0.85) status = 'tight';

  return {
    fixedTotal,
    spendable,
    totalDays,
    dayNumber,
    daysLeft,
    totalSpent,
    spentToday,
    remaining,
    todayAllowance,
    leftToday,
    originalDaily,
    avgDaily,
    runOutDay,
    runOutDate,
    willLast,
    percentUsed: spendable > 0 ? Math.min((totalSpent / spendable) * 100, 100) : 0,
    status,
  };
}

/** Spending per day across the period, for the bar chart */
export function getDailySeries(budget, expenses, today = todayISO()) {
  const summary = getBudgetSummary(budget, expenses, today);
  const series = [];
  for (let i = 0; i < summary.totalDays; i++) {
    const date = addDays(budget.startDate, i);
    const spent = expenses.filter((e) => e.date === date).reduce((s, e) => s + e.amount, 0);
    series.push({
      date,
      label: String(i + 1),
      spent,
      allowance: summary.originalDaily,
      isToday: date === today,
      isFuture: date > today,
    });
  }
  return series;
}

/** Totals per category, sorted largest first */
export function getCategoryTotals(expenses, categories) {
  const totals = {};
  expenses.forEach((e) => {
    totals[e.category] = (totals[e.category] || 0) + e.amount;
  });
  const grand = Object.values(totals).reduce((s, v) => s + v, 0) || 1;
  return categories
    .map((c) => ({ ...c, total: totals[c.id] || 0, percent: ((totals[c.id] || 0) / grand) * 100 }))
    .filter((c) => c.total > 0)
    .sort((a, b) => b.total - a.total);
}

/** "Can I afford it?" — what happens to the daily allowance after a purchase */
export function checkAffordability(summary, price) {
  const remainingAfter = summary.remaining - price;
  const daysAfterToday = Math.max(summary.daysLeft - 1, 1);
  const newDaily = remainingAfter / daysAfterToday;
  return {
    price,
    remainingAfter,
    newDaily,
    affordable: remainingAfter > 0 && newDaily >= summary.originalDaily * 0.6,
  };
}

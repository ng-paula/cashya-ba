import AppLayout from '../components/AppLayout.jsx';
import BarChart from '../components/BarChart.jsx';
import Icon from '../components/Icon.jsx';
import { useBudget } from '../context/BudgetContext.jsx';
import { CATEGORIES, categoryById } from '../data/categories.js';
import { formatDate, formatPeso, getCategoryTotals, getDailySeries } from '../utils/budget.js';
import '../styles/pages/dashboard.css';

const STATUS_COPY = {
  kasya: { icon: 'check', label: 'On track' },
  tight: { icon: 'alert', label: 'Getting tight' },
  hindi: { icon: 'alert', label: "Won't last at this pace" },
};

const QUICK_ASKS = ['How much do I have left?', 'Can I afford a ₱500 treat?'];

export default function Dashboard({ onNavigate, current }) {
  const { budget, expenses, summary, goals = [] } = useBudget();
  const series = getDailySeries(budget, expenses);
  const categories = getCategoryTotals(expenses, CATEGORIES);
  const recent = [...expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id)).slice(0, 5);
  const status = STATUS_COPY[summary.status];
  const avgVsPlan = ((summary.avgDaily - summary.originalDaily) / summary.originalDaily) * 100;
  const top = categories[0];
  const usedToday = summary.todayAllowance > 0 ? Math.min((summary.spentToday / summary.todayAllowance) * 100, 100) : 100;
  return (
    <AppLayout
      current={current}
      onNavigate={onNavigate}
      title="Dashboard"
      subtitle={`${budget.type === 'baon' ? 'Baon' : 'Sahod'} · ${formatDate(budget.startDate)} – ${formatDate(budget.endDate)}`}
    >
      {/* One main card: what you can spend today, whether you're on track, and the 3 supporting numbers */}
      <section className={`dash-hero dash-hero--${summary.status}`}>
        <div className="dash-hero__main">
          <div className="dash-hero__head">
            <span className="dash-hero__label">Left to spend today</span>
            <span className="dash-hero__status">
              <Icon name={status.icon} size={14} strokeWidth={2.6} /> {status.label}
            </span>
          </div>
          <strong className="dash-hero__value amount">{formatPeso(Math.max(summary.leftToday, 0))}</strong>
          <div className="dash-hero__meter" role="img" aria-label={`${Math.round(usedToday)}% of today's allowance used`}>
            <span style={{ width: `${usedToday}%` }} />
          </div>
          <p className="dash-hero__note">
            {formatPeso(summary.spentToday)} spent of {formatPeso(summary.todayAllowance)} today.{' '}
            {summary.willLast
              ? `At this pace your money lasts until ${formatDate(budget.endDate)}.`
              : `At this pace you run out on ${formatDate(summary.runOutDate)}. Keep it under ${formatPeso(summary.todayAllowance)}/day.`}
          </p>
        </div>

        <div className="dash-hero__side">
          <div className="dash-hero__actions">
            <button className="btn btn-dark btn-sm" onClick={() => onNavigate('expenses?add')}>
              <Icon name="plus" size={15} /> Log expense
            </button>
            <button className="btn btn-light btn-sm" onClick={() => onNavigate('chat')}>
              <Icon name="chat" size={15} /> Log by chat
            </button>
          </div>
          <dl className="dash-hero__stats">
            <div>
              <dt>Remaining</dt>
              <dd className="amount">{formatPeso(summary.remaining)}</dd>
              <small>of {formatPeso(summary.spendable)}</small>
            </div>
            <div>
              <dt>Days left</dt>
              <dd>{summary.daysLeft}</dd>
              <small>Day {summary.dayNumber} of {summary.totalDays}</small>
            </div>
            <div>
              <dt>Spent so far</dt>
              <dd className="amount">{formatPeso(summary.totalSpent)}</dd>
              <small>{expenses.length} expenses</small>
            </div>
          </dl>
        </div>
      </section>

      <section className="dash-grid">
        <article className="card">
          <header className="card-header">
            <div>
              <h2 className="card-title">Daily spending</h2>
              <p className="dash-chart-sub">
                Avg {formatPeso(summary.avgDaily)}/day ·{' '}
                <span className={avgVsPlan <= 0 ? 'up' : 'down'}>
                  {Math.abs(avgVsPlan).toFixed(0)}% {avgVsPlan <= 0 ? 'below' : 'above'} plan
                </span>
              </p>
            </div>
            <div className="chart-legend">
              <span><i style={{ background: 'var(--midnight)' }} /> Spent</span>
              <span><i style={{ background: 'var(--red)' }} /> Over plan</span>
              <span><i className="chart-legend__line" /> Daily plan</span>
            </div>
          </header>

          <BarChart data={series} height={210} />
        </article>

        <article className="card">
          <header className="card-header">
            <h2 className="card-title">Where it goes</h2>
            <button className="link-btn" onClick={() => onNavigate('insights')}>
              Insights <Icon name="arrowRight" size={14} />
            </button>
          </header>

          {categories.length === 0 ? (
            <p className="muted">No expenses yet.</p>
          ) : (
            <ul className="cat-bars">
              {categories.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <div className="cat-bars__row">
                    <span className="cat-bars__name">
                      <i className="cat-dot" style={{ background: c.color }} />
                      {c.name}
                    </span>
                    <span className="amount">{formatPeso(c.total)}</span>
                    <span className="cat-bars__pct">{c.percent.toFixed(0)}%</span>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${c.percent}%`, background: c.color }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="dash-grid dash-grid--bottom">
        <article className="card">
          <header className="card-header">
            <h2 className="card-title">Recent expenses</h2>
            <button className="link-btn" onClick={() => onNavigate('expenses')}>
              See all <Icon name="arrowRight" size={14} />
            </button>
          </header>
          {recent.length === 0 ? (
            <p className="muted">No expenses yet. Log one from the AI Chat or the Expenses page.</p>
          ) : (
            <ul className="tx-list">
              {recent.map((e) => {
                const cat = categoryById(e.category);
                return (
                  <li key={e.id}>
                    <i className="cat-dot" style={{ background: cat.color }} />
                    <div className="tx-list__text">
                      <strong>{e.note}</strong>
                      <small>
                        {cat.name} · {formatDate(e.date)}
                      </small>
                    </div>
                    <span className="amount tx-list__amt">−{formatPeso(e.amount)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </article>

        <div className="dash-side">
          <article className="card tip">
            <p className="forecast__label">
              <Icon name="sparkle" size={15} /> Tip
            </p>
            <p>
              {top?.id === 'wants'
                ? 'Wants are your top category. Skipping one milk tea a week saves about ₱480 a month.'
                : `${top?.name || 'Food'} is your biggest expense. Bringing baon twice a week can cut it by about 20%.`}
            </p>
            <div className="tip__asks">
              {QUICK_ASKS.map((q) => (
                <button key={q} onClick={() => onNavigate('chat')}>
                  {q}
                </button>
              ))}
            </div>
            <button className="link-btn link-btn--light" onClick={() => onNavigate('chat')}>
              Ask Cashya <Icon name="arrowRight" size={14} />
            </button>
          </article>

          <article className="card dash-goals">
            <header className="card-header">
              <h2 className="card-title">Savings goals</h2>
              <button className="link-btn" onClick={() => onNavigate('goals')}>
                {goals.length ? 'All goals' : 'Add one'} <Icon name="arrowRight" size={14} />
              </button>
            </header>
            {goals.length === 0 ? (
              <p className="muted dash-goals__empty">Saving for something? Set a goal and see how close you are each day.</p>
            ) : (
              <ul className="dash-goals__list">
                {goals.slice(0, 2).map((g) => {
                  const pct = g.target > 0 ? Math.min((g.saved / g.target) * 100, 100) : 0;
                  return (
                    <li key={g.id}>
                      <div className="dash-goals__row">
                        <strong>{g.name}</strong>
                        <span className="amount">
                          {formatPeso(g.saved)} <small>/ {formatPeso(g.target)}</small>
                        </span>
                      </div>
                      <div className="dash-goals__bar">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </article>
        </div>
      </section>
    </AppLayout>
  );
}

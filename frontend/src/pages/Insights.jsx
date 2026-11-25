import AppLayout from '../components/AppLayout.jsx';
import Icon from '../components/Icon.jsx';
import { useBudget } from '../context/BudgetContext.jsx';
import { CATEGORIES } from '../data/categories.js';
import { formatPeso, getCategoryTotals, getDailySeries } from '../utils/budget.js';
import '../styles/pages/insights.css';

/** Donut chart drawn with a conic-gradient (no chart library needed) */
function Donut({ data, total }) {
  let acc = 0;
  const stops = data
    .map((d) => {
      const from = acc;
      acc += d.percent;
      return `${d.color} ${from}% ${acc}%`;
    })
    .join(', ');
  return (
    <div className="donut" style={{ background: `conic-gradient(${stops || '#e7e9e0 0 100%'})` }}>
      <div className="donut__hole">
        <small>Total spent</small>
        <strong className="amount">{formatPeso(total)}</strong>
      </div>
    </div>
  );
}

export default function Insights({ onNavigate, current }) {
  const { budget, expenses, summary } = useBudget();
  const cats = getCategoryTotals(expenses, CATEGORIES);
  const series = getDailySeries(budget, expenses).filter((d) => !d.isFuture);
  // Headroom so the plan line never touches the top of the card
  const maxDay = Math.max(...series.map((d) => d.spent), summary.originalDaily * 1.4, 1) * 1.1;
  const planPct = Math.min(summary.originalDaily / maxDay, 1);
  const hasSpending = series.some((d) => d.spent > 0);
  const biggest = series.reduce((a, b) => (b.spent > a.spent ? b : a), series[0] || { spent: 0, label: '-' });
  const daysUnder = series.filter((d) => d.spent <= d.allowance && !d.isToday).length;
  const wants = cats.find((c) => c.id === 'wants');
  const foodPerDay = (cats.find((c) => c.id === 'food')?.total || 0) / Math.max(series.length, 1);

  const insights = [
    {
      icon: 'trendUp',
      tone: 'green',
      title: `${daysUnder} of ${Math.max(series.length - 1, 0)} days under budget`,
      text: daysUnder > 0 ? 'Every peso you save rolls over and makes the remaining days easier.' : 'Try to stay under your daily plan; savings roll over to later days.',
    },
    {
      icon: 'alert',
      tone: 'amber',
      title: `Biggest day: Day ${biggest.label} (${formatPeso(biggest.spent)})`,
      text: 'Big days are usually social or online-shopping days. Plan them ahead as part of the budget.',
    },
    wants && {
      icon: 'sparkle',
      tone: 'lime',
      title: `Wants = ${wants.percent.toFixed(0)}% of spending`,
      text: wants.percent > 25 ? 'Above the 20–30% guideline. Try a "no milk tea" day twice a week.' : 'Within the 20–30% guideline for wants. Good balance!',
    },
    {
      icon: 'book',
      tone: 'blue',
      title: 'Food benchmark',
      text: `You average ${formatPeso(foodPerDay)}/day on food, ${
        foodPerDay < 200 ? 'below' : foodPerDay <= 300 ? 'within' : 'above'
      } the ₱200–₱300/day guide for Metro Manila.`,
    },
  ].filter(Boolean);

  return (
    <AppLayout current={current} onNavigate={onNavigate} title="Insights" subtitle="How you've been spending this period">
      <section className="ins-grid">
        <article className="card ins-donut">
          <header className="card-header">
            <h2 className="card-title">By category</h2>
          </header>
          <div className="ins-donut__body">
            <Donut data={cats} total={summary.totalSpent} />
            <ul className="ins-legend">
              {cats.map((c) => (
                <li key={c.id}>
                  <i style={{ background: c.color }} />
                  <span>{c.name}</span>
                  <strong className="amount">{formatPeso(c.total)}</strong>
                  <em>{c.percent.toFixed(0)}%</em>
                </li>
              ))}
            </ul>
          </div>
        </article>

        <article className="card ins-trend">
          <header className="card-header">
            <h2 className="card-title">Daily trend</h2>
            <span className="ins-plan">
              <i aria-hidden="true" /> Daily plan {formatPeso(summary.originalDaily)}
            </span>
          </header>
          <div className="trend">
            <div className="trend__plan" style={{ '--plan': planPct }} />
            {!hasSpending && <p className="trend__empty">No spending logged yet</p>}
            {series.map((d) => (
              <div key={d.label} className="trend__col">
                <span
                  className={`trend__bar ${d.spent > d.allowance ? 'is-over' : ''}`}
                  style={{ height: `${(d.spent / maxDay) * 100}%` }}
                  title={`Day ${d.label}: ${formatPeso(d.spent)}`}
                />
                <em>{d.label}</em>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="ins-cards">
        {insights.map((i) => (
          <article key={i.title} className={`card ins-card ins-card--${i.tone}`}>
            <span className="ins-card__icon">
              <Icon name={i.icon} size={20} />
            </span>
            <h3>{i.title}</h3>
            <p>{i.text}</p>
          </article>
        ))}
      </section>
    </AppLayout>
  );
}

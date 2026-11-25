import { useState } from 'react';
import AppLayout from '../components/AppLayout.jsx';
import Icon from '../components/Icon.jsx';
import { useBudget } from '../context/BudgetContext.jsx';
import { daysBetween, formatDate, formatPeso, todayISO } from '../utils/budget.js';
import '../styles/pages/goals.css';

const EMPTY = { name: '', target: '', due: '' };

export default function Goals({ onNavigate, current }) {
  const { goals, addGoal, addToGoal } = useBudget();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim() || !(Number(form.target) > 0)) {
      setError('Enter a goal name and a target amount.');
      return;
    }
    try {
      await addGoal({ name: form.name.trim(), target: Number(form.target), due: form.due || todayISO() });
      setForm(EMPTY);
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    }
  };

  // Inline "Add savings" on a goal card (replaces the browser's prompt box)
  const [depositFor, setDepositFor] = useState(null); // goal id being topped up
  const [depositAmt, setDepositAmt] = useState('');
  const [depositError, setDepositError] = useState('');

  const openDeposit = (goal) => {
    setDepositFor(goal.id);
    setDepositAmt('');
    setDepositError('');
  };

  const deposit = async (e, goal) => {
    e.preventDefault();
    const amount = Number(depositAmt);
    if (!(amount > 0)) {
      setDepositError('Enter an amount above ₱0.');
      return;
    }
    try {
      await addToGoal(goal.id, amount);
      setDepositFor(null);
    } catch (err) {
      setDepositError(err.message);
    }
  };

  return (
    <AppLayout
      current={current}
      onNavigate={onNavigate}
      title="Savings goals"
      subtitle={goals.length ? `${formatPeso(totalSaved)} saved of ${formatPeso(totalTarget)}` : 'Save up for the things you want'}
      action={
        <button className="btn btn-dark btn-sm" onClick={() => setShowForm((v) => !v)}>
          <Icon name={showForm ? 'x' : 'plus'} size={15} /> {showForm ? 'Close' : 'New goal'}
        </button>
      }
    >
      {showForm && (
        <form className="card goal-form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="g-name">Goal</label>
            <input id="g-name" className="input" placeholder="e.g. New phone" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="g-target">Target (₱)</label>
            <input id="g-target" className="input" type="number" inputMode="decimal" min="1" placeholder="5000" value={form.target} onChange={(e) => setForm({ ...form, target: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="g-due">Target date</label>
            <input id="g-due" className="input" type="date" min={todayISO()} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
          </div>
          <button type="submit" className="btn btn-lime">
            Save goal
          </button>
          {error && <p className="form-error goal-form__error">{error}</p>}
        </form>
      )}

      {goals.length === 0 && !showForm && (
        <article className="card empty-state">
          <span className="empty-state__icon">
            <Icon name="target" size={28} />
          </span>
          <h2>No goals yet</h2>
          <p className="muted">Saving for something? Add a goal and Cashya Ba? shows how much to set aside each day.</p>
          <button className="btn btn-dark" onClick={() => setShowForm(true)}>
            <Icon name="plus" size={15} /> New goal
          </button>
        </article>
      )}

      <section className="goals-grid">
        {goals.map((g) => {
          const pct = Math.min((g.saved / g.target) * 100, 100);
          const daysLeft = Math.max(daysBetween(todayISO(), g.due), 0);
          const perDay = daysLeft > 0 ? (g.target - g.saved) / daysLeft : g.target - g.saved;
          const done = pct >= 100;
          return (
            <article key={g.id} className={`card goal ${done ? 'is-done' : ''}`}>
              <div className="goal__top">
                <h3>{g.name}</h3>
                <span className="goal__pct">{pct.toFixed(0)}%</span>
              </div>
              <p className="goal__amounts">
                <strong className="amount">{formatPeso(g.saved)}</strong> of {formatPeso(g.target)}
              </p>
              <div className="progress">
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className="goal__foot">
                <small>
                  {done
                    ? 'Goal reached'
                    : daysLeft > 0
                    ? `${formatPeso(perDay)}/day · ${daysLeft} days left (${formatDate(g.due)})`
                    : `Due ${formatDate(g.due)}`}
                </small>
                {!done && depositFor !== g.id && (
                  <button className="link-btn" onClick={() => openDeposit(g)}>
                    <Icon name="plus" size={14} /> Add savings
                  </button>
                )}
              </div>

              {depositFor === g.id && (
                <form className="goal-deposit" onSubmit={(e) => deposit(e, g)}>
                  <label htmlFor={`dep-${g.id}`}>How much did you save?</label>
                  <div className="goal-deposit__quick">
                    {[50, 100, 500].map((n) => (
                      <button type="button" key={n} className={`chip ${Number(depositAmt) === n ? 'is-active' : ''}`} onClick={() => setDepositAmt(String(n))}>
                        {formatPeso(n)}
                      </button>
                    ))}
                  </div>
                  <div className="goal-deposit__row">
                    <div className="goal-deposit__money">
                      <span>₱</span>
                      <input
                        id={`dep-${g.id}`}
                        type="number"
                        inputMode="decimal"
                        min="1"
                        step="any"
                        placeholder="0"
                        autoFocus
                        value={depositAmt}
                        onChange={(e) => setDepositAmt(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setDepositFor(null)}
                      />
                    </div>
                    <button type="submit" className="btn btn-dark btn-sm">
                      Save
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDepositFor(null)}>
                      Cancel
                    </button>
                  </div>
                  {depositError && <p className="form-error">{depositError}</p>}
                </form>
              )}
            </article>
          );
        })}
      </section>
    </AppLayout>
  );
}

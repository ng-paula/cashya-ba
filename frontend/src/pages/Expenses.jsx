import { useEffect, useMemo, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout.jsx';
import Icon from '../components/Icon.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { useBudget } from '../context/BudgetContext.jsx';
import { CATEGORIES, categoryById } from '../data/categories.js';
import { formatDate, formatPeso, todayISO } from '../utils/budget.js';
import '../styles/pages/expenses.css';

export default function Expenses({ onNavigate, current }) {
  const { expenses, addExpense, deleteExpense } = useBudget();
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  // Arriving from "Log expense" (#/expenses?add) opens the form and jumps to it
  const openedToAdd = window.location.hash.includes('?add');
  const [showForm, setShowForm] = useState(openedToAdd); // phones: form is collapsed until needed
  const [form, setForm] = useState({ note: '', amount: '', category: 'food', date: todayISO() });
  const [error, setError] = useState('');
  const noteRef = useRef(null);
  const [confirm, confirmDialog] = useConfirm();

  useEffect(() => {
    if (!openedToAdd) return;
    noteRef.current?.focus();
    window.history.replaceState(null, '', '#/expenses'); // so a refresh doesn't reopen it
  }, [openedToAdd]);

  const filtered = useMemo(
    () =>
      expenses
        .filter((e) => filter === 'all' || e.category === filter)
        .filter((e) => e.note.toLowerCase().includes(query.trim().toLowerCase())),
    [expenses, filter, query]
  );

  // Group by date, newest first
  const groups = useMemo(() => {
    const map = {};
    filtered.forEach((e) => (map[e.date] = map[e.date] || []).push(e));
    return Object.entries(map)
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .map(([date, items]) => [date, [...items].sort((a, b) => b.id - a.id)]);
  }, [filtered]);

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!form.note.trim() || !amount || amount <= 0) {
      setError('Enter what you bought and an amount above ₱0.');
      return;
    }
    try {
      await addExpense({ note: form.note.trim(), amount, category: form.category, date: form.date });
      setForm({ ...form, note: '', amount: '' });
      setShowForm(false);
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (exp) => {
    const ok = await confirm({ title: 'Delete this expense?', text: `"${exp.note}" (${formatPeso(exp.amount)}) will be removed and your allowance recalculated.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    deleteExpense(exp.id).catch((err) => setError(err.message));
  };

  return (
    <AppLayout
      current={current}
      onNavigate={onNavigate}
      title="Expenses"
      subtitle={`${expenses.length} this period`}
      action={
        <button className="btn btn-dark btn-sm exp-add-toggle" onClick={() => setShowForm((v) => !v)}>
          <Icon name={showForm ? 'x' : 'plus'} size={15} /> {showForm ? 'Close' : 'Add'}
        </button>
      }
    >
      <section className="exp-layout">
        <form className={`card exp-form ${showForm ? 'is-open' : ''}`} onSubmit={submit}>
          <h2 className="card-title">Add expense</h2>
          <div className="field">
            <label htmlFor="exp-note">What did you buy?</label>
            <input id="exp-note" ref={noteRef} className="input" placeholder="e.g. Lunch at carinderia" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          <div className="exp-form__row">
            <div className="field">
              <label htmlFor="exp-amt">Amount (₱)</label>
              <input id="exp-amt" className="input" type="number" inputMode="decimal" min="1" step="any" placeholder="150" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="exp-date">Date</label>
              <input id="exp-date" className="input" type="date" value={form.date} max={todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label htmlFor="exp-cat">Category</label>
            <select id="exp-cat" className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="btn btn-dark btn-block">
            Save expense
          </button>
          <p className="exp-form__hint">
            Faster: type "jeep 26, lunch 150" in the{' '}
            <button type="button" className="link-btn" onClick={() => onNavigate('chat')}>
              AI Chat
            </button>
          </p>
        </form>

        <article className="card exp-list">
          <div className="exp-toolbar">
            <label className="exp-search">
              <Icon name="search" size={16} />
              <input placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search expenses" />
            </label>
            <select className="input exp-filter" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by category">
              <option value="all">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <p className="exp-total">
            {filtered.length} {filtered.length === 1 ? 'expense' : 'expenses'} · <strong className="amount">{formatPeso(total)}</strong>
          </p>

          {groups.length === 0 && <p className="exp-empty muted">No expenses found.</p>}

          {groups.map(([date, items]) => (
            <div key={date} className="exp-group">
              <div className="exp-group__head">
                <span>{date === todayISO() ? 'Today' : formatDate(date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                <span className="amount">{formatPeso(items.reduce((s, i) => s + i.amount, 0))}</span>
              </div>
              <ul className="tx-list">
                {items.map((e) => {
                  const cat = categoryById(e.category);
                  return (
                    <li key={e.id}>
                      <i className="cat-dot" style={{ background: cat.color }} />
                      <div className="tx-list__text">
                        <strong>{e.note}</strong>
                        <small>{cat.name}</small>
                      </div>
                      <span className="amount tx-list__amt">−{formatPeso(e.amount)}</span>
                      <button className="exp-del" onClick={() => remove(e)} aria-label={`Delete ${e.note}`} title="Delete">
                        <Icon name="trash" size={15} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </article>
      </section>
      {confirmDialog}
    </AppLayout>
  );
}

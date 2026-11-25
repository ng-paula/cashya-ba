import { useEffect, useState } from 'react';
import AppLayout from '../components/AppLayout.jsx';
import Icon from '../components/Icon.jsx';
import { api } from '../api/client.js';
import { useBudget } from '../context/BudgetContext.jsx';
import { refreshAlerts } from '../components/NotificationBell.jsx';
import { formatDate, formatPeso } from '../utils/budget.js';
import '../styles/pages/settings.css';

/* Alerts appear in the bell (top bar) and are also POSTed by the backend to a webhook (WEBHOOK_URL) */
const ALERTS = [
  { id: 'morning', title: 'Daily allowance', desc: 'First time you open the app each day — "Today\'s allowance: ₱420"' },
  { id: 'warn50', title: '50% budget used', desc: 'Heads-up when half the budget is gone' },
  { id: 'warn80', title: '80% & 100% budget used', desc: 'Warning with a suggested daily limit' },
  { id: 'runout', title: 'Run-out forecast', desc: 'When the forecast says the money won\'t last' },
];
const DEFAULT_PREFS = { morning: true, warn50: true, warn80: true, runout: true, nolog: false };

const ROLE_LABEL = { user: 'User', parent: 'Parent', child: 'Child', admin: 'Admin' };
const STATUS_LABEL = { kasya: 'on track', tight: 'tight', hindi: 'overspending' };

function Household() {
  const [children, setChildren] = useState([]);
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState(null);

  const load = () => api.getChildren().then(setChildren).catch(() => {});
  useEffect(() => {
    load();
  }, []);

  const link = async (e) => {
    e.preventDefault();
    setMsg(null);
    try {
      const c = await api.linkChild(email);
      setMsg({ ok: true, text: `${c.fullName} is now linked as your child.` });
      setEmail('');
      load();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  return (
    <article className="card">
      <header className="card-header">
        <h2 className="card-title">Household</h2>
      </header>
      {children.length === 0 && <p className="muted">No linked children yet.</p>}
      <ul className="set-list">
        {children.map((c) => (
          <li key={c.id}>
            <div>
              <strong>{c.fullName}</strong>
              <small>
                {c.summary
                  ? `${formatPeso(c.summary.remaining)} left · ${c.summary.days_left} day(s) · ${STATUS_LABEL[c.summary.status]}`
                  : 'No baon set yet'}
              </small>
            </div>
          </li>
        ))}
      </ul>
      <form className="set-inline" onSubmit={link}>
        <input className="input" type="email" required placeholder="Child's account email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <button className="btn btn-dark btn-sm" type="submit">
          Link child
        </button>
      </form>
      {msg && <p className={msg.ok ? 'form-ok' : 'form-error'}>{msg.text}</p>}
    </article>
  );
}

const EMPTY_PW = { current: '', next: '', confirm: '' };

function ChangePassword() {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState(EMPTY_PW);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const set = (key) => (e) => setPw({ ...pw, [key]: e.target.value });
  const close = () => {
    setOpen(false);
    setPw(EMPTY_PW);
    setShow(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);
    if (pw.next.length < 8) return setMsg({ ok: false, text: 'Your new password needs at least 8 characters.' });
    if (pw.next !== pw.confirm) return setMsg({ ok: false, text: "The new passwords don't match." });
    setBusy(true);
    try {
      await api.changePassword(pw.current, pw.next);
      close();
      setMsg({ ok: true, text: 'Password updated. Use your new password next time you sign in.' });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  const type = show ? 'text' : 'password';

  return (
    <article className="card">
      <header className="card-header">
        <div>
          <h2 className="card-title">Password</h2>
          {!open && <p className="set-sub">Change the password you use to sign in.</p>}
        </div>
        {!open && (
          <button
            className="btn btn-light btn-sm"
            onClick={() => {
              setOpen(true);
              setMsg(null);
            }}
          >
            Change password
          </button>
        )}
      </header>

      {open && (
        <form className="set-password" onSubmit={submit}>
          <div className="field">
            <label htmlFor="pw-current">Current password</label>
            <input id="pw-current" className="input" type={type} autoComplete="current-password" required autoFocus value={pw.current} onChange={set('current')} />
          </div>
          <div className="field">
            <label htmlFor="pw-next">New password</label>
            <input id="pw-next" className="input" type={type} autoComplete="new-password" required minLength={8} placeholder="At least 8 characters" value={pw.next} onChange={set('next')} />
          </div>
          <div className="field">
            <label htmlFor="pw-confirm">Confirm new password</label>
            <input id="pw-confirm" className="input" type={type} autoComplete="new-password" required value={pw.confirm} onChange={set('confirm')} />
          </div>
          <label className="set-password__show">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
          </label>
          <div className="set-password__actions">
            <button type="button" className="btn btn-ghost btn-sm" onClick={close}>
              Cancel
            </button>
            <button type="submit" className="btn btn-dark btn-sm" disabled={busy}>
              {busy ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      )}
      {msg && <p className={msg.ok ? 'form-ok' : 'form-error'}>{msg.text}</p>}
    </article>
  );
}

export default function Settings({ onNavigate, current }) {
  const { user, budget, summary, updateProfile, logout } = useBudget();
  const [alerts, setAlerts] = useState({ ...DEFAULT_PREFS, ...(user.alertPrefs || {}) });
  const [msg, setMsg] = useState(null);

  const toggle = async (id) => {
    const next = { ...alerts, [id]: !alerts[id] };
    setAlerts(next);
    try {
      await updateProfile({ alertPrefs: next });
    } catch (err) {
      setAlerts(alerts);
      setMsg({ ok: false, text: err.message });
    }
  };

  const sendTest = async () => {
    try {
      const r = await api.testAlert();
      refreshAlerts();
      setMsg({
        ok: r.status !== 'failed',
        text: !r.webhookConfigured
          ? 'Test alert added to your bell. No webhook URL is set, so nothing was sent out.'
          : r.status === 'sent'
          ? 'Test alert added to your bell and sent to the webhook.'
          : 'Test alert added to your bell, but the webhook did not respond.',
      });
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    }
  };

  const signOut = () => {
    logout();
    onNavigate('landing');
  };

  return (
    <AppLayout current={current} onNavigate={onNavigate} title="Settings" subtitle="Budget, alerts, and account">
      <section className="set-grid">
        <article className="card set-profile">
          <span className="avatar set-profile__avatar">{user.initials}</span>
          <h3>{user.fullName}</h3>
          <p className="muted">{user.email}</p>
          <p className="set-profile__role">
            {ROLE_LABEL[user.role]} account
            <small>Roles are assigned by an admin.</small>
          </p>
          {user.role === 'admin' && (
            <button className="btn btn-dark btn-block" onClick={() => onNavigate('admin')}>
              <Icon name="shield" size={16} /> Open Admin Panel
            </button>
          )}
          <button className="btn btn-ghost btn-block" onClick={signOut}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </article>

        <div className="set-main">
          {budget && (
            <article className="card">
              <header className="card-header">
                <h2 className="card-title">Current budget</h2>
                {user.role !== 'child' && (
                  <button className="btn btn-light btn-sm" onClick={() => onNavigate('onboarding')}>
                    <Icon name="plus" size={14} /> New period
                  </button>
                )}
              </header>
              <dl className="set-budget">
                <div>
                  <dt>Type</dt>
                  <dd>{budget.type === 'baon' ? 'Baon' : 'Sahod'}</dd>
                </div>
                <div>
                  <dt>Amount</dt>
                  <dd className="amount">{formatPeso(budget.amount)}</dd>
                </div>
                <div>
                  <dt>Period</dt>
                  <dd>
                    {formatDate(budget.startDate)} – {formatDate(budget.endDate)}
                  </dd>
                </div>
                <div>
                  <dt>Fixed expenses</dt>
                  <dd className="amount">{formatPeso(summary.fixedTotal)}</dd>
                </div>
              </dl>
            </article>
          )}

          <article className="card">
            <header className="card-header">
              <h2 className="card-title">Alerts</h2>
              <button className="btn btn-light btn-sm" onClick={sendTest}>
                <Icon name="send" size={14} /> Send test alert
              </button>
            </header>

            <p className="set-note">
              <Icon name="bell" size={14} /> Alerts show up in the bell at the top of every page.
            </p>
            {msg && <p className={msg.ok ? 'form-ok' : 'form-error'}>{msg.text}</p>}

            <ul className="set-list">
              {ALERTS.map((a) => (
                <li key={a.id}>
                  <div>
                    <strong>{a.title}</strong>
                    <small>{a.desc}</small>
                  </div>
                  <button
                    className={`switch ${alerts[a.id] ? 'on' : ''}`}
                    onClick={() => toggle(a.id)}
                    role="switch"
                    aria-checked={alerts[a.id]}
                    aria-label={a.title}
                  />
                </li>
              ))}
            </ul>
          </article>

          {user.role === 'parent' && <Household />}

          <ChangePassword />

          <article className="card set-privacy">
            <Icon name="shield" size={22} />
            <div>
              <h3>Privacy & safety</h3>
              <p>
                Card numbers, mobile numbers, and emails are masked before reaching the AI or the database. Your data is only
                visible to you{user.role === 'child' ? ' and your linked parent' : ''}. Cashya Ba? never gives investment, loan, or
                gambling advice.
              </p>
            </div>
          </article>
        </div>
      </section>
    </AppLayout>
  );
}

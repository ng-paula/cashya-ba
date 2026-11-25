import { useEffect, useState } from 'react';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { useBudget } from '../context/BudgetContext.jsx';
import { formatPeso } from '../utils/budget.js';
import '../styles/pages/auth.css';

/* Looping chat preview for the side panel, one script per budget type */
const PANEL_SCRIPTS = {
  baon: {
    total: 1000,
    days: 7,
    day: 3,
    allowance: 143,
    chat: [
      { me: 'jeep 13, siomai 35', ai: 'Logged ₱48. You have ₱95 left for today.', spend: 48 },
      { me: 'Can I buy milk tea?', ai: 'A ₱90 milk tea fits, but it uses almost all of today.' },
      { me: 'load 20', ai: 'Logged ₱20. Still on track for the week.', spend: 20 },
    ],
  },
  sahod: {
    total: 10000,
    days: 15,
    day: 6,
    allowance: 667,
    chat: [
      { me: 'jeep 26, lunch 150', ai: 'Logged ₱176. You have ₱491 left for today.', spend: 176 },
      { me: 'Can I afford ₱1,500 shoes?', ai: 'A bit risky. Better to save for it as a goal first.' },
      { me: 'grocery 320', ai: 'Logged ₱320. Tomorrow adjusts slightly so you still last.', spend: 320 },
    ],
  },
};

const PANEL_PERKS = [
  { icon: 'chat', label: 'Log by chat' },
  { icon: 'calendar', label: 'Daily allowance' },
  { icon: 'bell', label: 'Run-out alerts' },
];

function AuthPanel() {
  const [type, setType] = useState('sahod');
  const [step, setStep] = useState(0); // index into chat; each message shows typing, then reply
  const [typing, setTyping] = useState(false);
  const script = PANEL_SCRIPTS[type];
  const msg = script.chat[step % script.chat.length];
  const spent = script.chat.slice(0, (step % script.chat.length) + (typing ? 0 : 1)).reduce((s, m) => s + (m.spend || 0), 0);
  const left = Math.max(script.allowance - spent, 0);
  const pctLeft = Math.round((left / script.allowance) * 100);

  useEffect(() => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      setTyping(false);
      return undefined;
    }
    setTyping(true);
    const reply = setTimeout(() => setTyping(false), 900);
    const next = setTimeout(() => setStep((s) => s + 1), 3600);
    return () => {
      clearTimeout(reply);
      clearTimeout(next);
    };
  }, [step, type]);

  const pickType = (t) => {
    if (t === type) return;
    setType(t);
    setStep(0);
  };

  return (
    <section className="auth__panel">
      <div className="auth__panel-top">
        <Logo size="lg" light />
        <div className="auth__switch" role="radiogroup" aria-label="Preview budget type">
          {['baon', 'sahod'].map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? 'is-active' : ''} onClick={() => pickType(t)}>
              {t === 'baon' ? 'Baon' : 'Sahod'}
            </button>
          ))}
        </div>
      </div>

      <div className="auth__stage" aria-hidden="true">
        <span className="auth__shape auth__shape--square">
          <Icon name="leaf" size={20} />
          For baon
        </span>
        <span className="auth__shape auth__shape--circle">Sahod mode</span>
        <span className="auth__shape auth__shape--triangle">It fits!</span>

        <div className="auth__card">
          <div className="auth__card-top">
            <div>
              <small>Left today</small>
              <strong className="amount">{formatPeso(left)}</strong>
            </div>
            <span className={`auth__status ${pctLeft < 30 ? 'is-low' : ''}`}>
              <Icon name={pctLeft < 30 ? 'alert' : 'check'} size={12} strokeWidth={2.6} />
              {pctLeft < 30 ? 'Running low' : 'On track'}
            </span>
          </div>
          <div className="auth__meter">
            <span style={{ width: `${pctLeft}%` }} />
          </div>
          <div className="auth__days">
            {Array.from({ length: Math.min(script.days, 15) }, (_, i) => (
              <i key={i} className={i < script.day - 1 ? 'is-done' : i === script.day - 1 ? 'is-today' : ''} />
            ))}
          </div>
          <small className="auth__card-foot">
            Day {script.day} of {script.days} · {formatPeso(script.total)} {type}
          </small>

          <div className="auth__chat" key={`${type}-${step}`}>
            <div className="auth__bubble auth__bubble--me">{msg.me}</div>
            {typing ? (
              <div className="auth__bubble auth__bubble--ai auth__typing">
                <i />
                <i />
                <i />
              </div>
            ) : (
              <div className="auth__bubble auth__bubble--ai">{msg.ai}</div>
            )}
          </div>
        </div>
      </div>

      <div className="auth__panel-copy">
        <h2>Baon man o sahod, pagkasyahin natin.</h2>
        <p>Your AI budget buddy that keeps every peso on track until the next one arrives.</p>
        <ul className="auth__perks">
          {PANEL_PERKS.map((p) => (
            <li key={p.label}>
              <Icon name={p.icon} size={14} />
              {p.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* Demo accounts created by backend/app/seed.py — one per role to show RBAC */
const DEMO_ACCOUNTS = [
  { email: 'juan@cashya.demo', label: 'User', desc: 'Sahod budget' },
  { email: 'maria@cashya.demo', label: 'Parent', desc: 'Household' },
  { email: 'ben@cashya.demo', label: 'Child', desc: 'Baon from parent' },
  { email: 'admin@cashya.demo', label: 'Admin', desc: 'KB & metrics' },
];
const DEMO_PASSWORD = 'cashya123';

export default function Login({ onNavigate }) {
  const { signIn, signUp } = useBudget();
  const startInSignUp = window.location.hash.includes('signup');
  const [mode, setMode] = useState(startInSignUp ? 'signup' : 'signin');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(fullName, email, password);
        onNavigate('onboarding');
      } else {
        const user = await signIn(email, password);
        onNavigate(user.role === 'admin' ? 'admin' : 'dashboard');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  // Each tab starts with a clean form, so demo credentials never carry into sign-up
  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setFullName('');
    setEmail('');
    setPassword('');
    setError('');
  };

  const pickDemo = (acc) => {
    setMode('signin');
    setEmail(acc.email);
    setPassword(DEMO_PASSWORD);
    setError('');
  };

  return (
    <div className="auth">
      <AuthPanel />

      <section className="auth__form-wrap">
        <form className="auth__form" onSubmit={handleSubmit}>
          <button type="button" className="btn btn-ghost btn-sm auth__back" onClick={() => onNavigate('landing')}>
            <Icon name="arrowLeft" size={16} /> Back
          </button>

          <div className="auth__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'is-active' : ''} onClick={() => switchMode('signin')}>
              Sign in
            </button>
            <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'is-active' : ''} onClick={() => switchMode('signup')}>
              Create account
            </button>
          </div>

          <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>

          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="fullName">Full name</label>
              <input id="fullName" className="input" required minLength={2} placeholder="Juan Dela Cruz" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required placeholder="juan@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              required
              minLength={mode === 'signup' ? 8 : 1}
              placeholder={mode === 'signup' ? 'At least 8 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-dark btn-block" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          {mode === 'signin' && (
            <>
              <div className="auth__divider">
                <span>or explore a demo</span>
              </div>
              <fieldset className="auth__demo">
                <legend className="auth__demo-head">
                  <span className="auth__demo-badge">Demo</span>
                  <span>
                    <strong>Try it with a sample account</strong>
                    <small>Pick a role to fill in its login, then press Sign in. Password: {DEMO_PASSWORD}</small>
                  </span>
                </legend>
                <div className="auth__roles">
                  {DEMO_ACCOUNTS.map((acc) => (
                    <button type="button" key={acc.email} className={`auth__role ${email === acc.email ? 'is-selected' : ''}`} onClick={() => pickDemo(acc)} aria-pressed={email === acc.email}>
                      <strong>{acc.label}</strong>
                      <small>{acc.desc}</small>
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}
        </form>
      </section>
    </div>
  );
}

import { useState } from 'react';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { useBudget } from '../context/BudgetContext.jsx';
import { addDays, formatDate, formatPeso, todayISO } from '../utils/budget.js';
import '../styles/pages/onboarding.css';

const STEP_TITLES = ['Baon or sahod?', 'How much?', 'Until when?', 'Fixed expenses'];
const DEFAULTS = { baon: { amount: 1000, days: 7 }, sahod: { amount: 10000, days: 15 } };
const MAX_DAYS = 92; // the backend allows budget periods of up to ~3 months

/** Values the visitor entered in the landing-page calculator, if any */
function readDraft() {
  try {
    const d = JSON.parse(sessionStorage.getItem('cashya_draft') || 'null');
    if (d && (d.type === 'baon' || d.type === 'sahod') && d.amount > 0 && d.days > 0) return d;
  } catch {
    /* no draft */
  }
  return null;
}

export default function Onboarding({ onNavigate }) {
  const { startNewBudget } = useBudget();
  const [draft] = useState(readDraft);
  const [step, setStep] = useState(0);
  const [type, setType] = useState(draft?.type || 'sahod');
  // Inputs are kept as text so the boxes can be emptied while typing
  const [amountText, setAmountText] = useState(String(draft?.amount || DEFAULTS.sahod.amount));
  const [daysText, setDaysText] = useState(String(draft?.days || DEFAULTS.sahod.days));
  const amount = Number(amountText) || 0;
  const days = parseInt(daysText, 10) || 0;
  const setAmount = (v) => setAmountText(String(v));
  const setDays = (v) => setDaysText(String(v));

  const pickType = (t) => {
    if (t === type) return;
    setType(t);
    setAmount(DEFAULTS[t].amount);
    setDays(DEFAULTS[t].days);
  };
  // Start empty (users add their own); carry over the calculator's fixed costs if any
  const [fixed, setFixed] = useState(draft?.fixed > 0 ? [{ name: 'Rent / bills', amount: draft.fixed }] : []);

  const fixedTotal = fixed.reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const validDays = days >= 1 && days <= MAX_DAYS;
  const daily = validDays ? Math.max((amount - fixedTotal) / days, 0) : 0;
  const endDate = addDays(todayISO(), Math.max(days, 1) - 1);
  const dayWord = days === 1 ? 'day' : 'days';

  // What blocks the Continue button on each step (empty string = OK)
  const stepError = [
    '',
    amount > 0 ? '' : 'Enter an amount above ₱0.',
    validDays ? '' : `Enter between 1 and ${MAX_DAYS} days.`,
    fixedTotal < amount ? '' : 'Fixed expenses are more than your budget.',
  ][step];

  const quickAmounts = type === 'baon' ? [500, 1000, 2000, 3000] : [5000, 10000, 15000, 20000];
  const quickDays = type === 'baon' ? [5, 7, 14, 30] : [13, 15, 16, 30];

  const updateFixed = (i, key, value) =>
    setFixed((prev) => prev.map((f, idx) => (idx === i ? { ...f, [key]: value } : f)));

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = async () => {
    setError('');
    setBusy(true);
    try {
      await startNewBudget({
        type,
        amount: Number(amount),
        startDate: todayISO(),
        endDate,
        fixedExpenses: fixed
          .map((f) => ({ name: f.name.trim(), amount: Number(f.amount) || 0 }))
          .filter((f) => f.name && f.amount > 0),
      });
      try {
        sessionStorage.removeItem('cashya_draft'); // used up
      } catch {
        /* ignore */
      }
      onNavigate('dashboard');
    } catch (err) {
      setError(err.status === 403 ? 'Only your parent can set your baon (household mode).' : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding__card">
        <header className="onboarding__head">
          <Logo />
          <button className="btn btn-ghost btn-sm" onClick={() => onNavigate('dashboard')}>
            <Icon name="x" size={16} /> Cancel
          </button>
        </header>

        <ol className="onboarding__steps" aria-label="Progress">
          {STEP_TITLES.map((t, i) => (
            <li key={t} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>
              <span>{i < step ? <Icon name="check" size={14} strokeWidth={2.6} /> : i + 1}</span>
              {t}
            </li>
          ))}
        </ol>

        <div className="onboarding__body">
          <section className="onboarding__form">
            {step === 0 && (
              <>
                <h1>Para saan ang budget na ito?</h1>
                <p className="muted">We'll tune suggestions and alerts based on your choice.</p>
                <div className="choice-grid">
                  <button className={`choice ${type === 'baon' ? 'is-selected' : ''}`} onClick={() => pickType('baon')}>
                    <span className="choice__icon"><Icon name="book" size={22} /></span>
                    <strong>Baon</strong>
                    <small>Allowance from parents — weekly or monthly</small>
                  </button>
                  <button className={`choice ${type === 'sahod' ? 'is-selected' : ''}`} onClick={() => pickType('sahod')}>
                    <span className="choice__icon"><Icon name="wallet" size={22} /></span>
                    <strong>Sahod</strong>
                    <small>Salary — every 15th & 30th, or monthly</small>
                  </button>
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <h1>Magkano ang {type === 'baon' ? 'baon' : 'sahod'} mo?</h1>
                <p className="muted">Enter the full amount you received.</p>
                <div className="big-input">
                  <span>₱</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    value={amountText}
                    placeholder="0"
                    onChange={(e) => setAmountText(e.target.value)}
                    aria-label="Budget amount"
                  />
                </div>
                <div className="quick-row">
                  {quickAmounts.map((q) => (
                    <button key={q} className={`chip ${amount === q ? 'is-active' : ''}`} onClick={() => setAmount(q)}>
                      {formatPeso(q)}
                    </button>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h1>Ilang araw dapat tumagal?</h1>
                <p className="muted">Until your next {type === 'baon' ? 'baon' : 'sahod'} arrives.</p>
                <div className="big-input">
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max={MAX_DAYS}
                    value={daysText}
                    placeholder="0"
                    onChange={(e) => setDaysText(e.target.value)}
                    aria-label="Number of days"
                  />
                  <span>{dayWord}</span>
                </div>
                <div className="quick-row">
                  {quickDays.map((d) => (
                    <button key={d} className={`chip ${days === d ? 'is-active' : ''}`} onClick={() => setDays(d)}>
                      {d} days
                    </button>
                  ))}
                </div>
                {validDays && (
                  <p className="onboarding__hint">
                    <Icon name="calendar" size={16} /> {formatDate(todayISO())} → {formatDate(endDate)}
                  </p>
                )}
              </>
            )}

            {step === 3 && (
              <>
                <h1>May fixed expenses ka ba?</h1>
                <p className="muted">These are set aside first, so your daily allowance is realistic.</p>
                <div className="fixed-list">
                  {fixed.length === 0 && <p className="muted fixed-empty">Wala? Okay lang. You can skip this step.</p>}
                  {fixed.length > 0 && (
                    <div className="fixed-row fixed-row--labels" aria-hidden="true">
                      <span>Name</span>
                      <span>Amount (₱)</span>
                      <span />
                    </div>
                  )}
                  {fixed.map((f, i) => (
                    <div key={i} className="fixed-row">
                      <input
                        className="input"
                        value={f.name}
                        placeholder="e.g. Rent, load, Wi-Fi"
                        onChange={(e) => updateFixed(i, 'name', e.target.value)}
                        aria-label={`Fixed expense ${i + 1} name`}
                      />
                      <input
                        className="input"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        placeholder="0"
                        value={f.amount}
                        onChange={(e) => updateFixed(i, 'amount', e.target.value)}
                        aria-label={`Fixed expense ${i + 1} amount in pesos`}
                      />
                      <button className="icon-circle" aria-label={`Remove fixed expense ${i + 1}`} onClick={() => setFixed((p) => p.filter((_, idx) => idx !== i))}>
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  ))}
                  <button className="btn btn-light btn-sm" onClick={() => setFixed((p) => [...p, { name: '', amount: '' }])}>
                    <Icon name="plus" size={16} /> Add fixed expense
                  </button>
                </div>
              </>
            )}

            {(error || stepError) && <p className="form-error">{error || stepError}</p>}

            <div className="onboarding__nav">
              {step > 0 && (
                <button className="btn btn-ghost" onClick={() => setStep(step - 1)}>
                  <Icon name="arrowLeft" size={16} /> Back
                </button>
              )}
              {step < 3 ? (
                <button className="btn btn-dark" onClick={() => setStep(step + 1)} disabled={Boolean(stepError)}>
                  Continue <Icon name="arrowRight" size={16} />
                </button>
              ) : (
                <button className="btn btn-lime" onClick={finish} disabled={busy || Boolean(stepError)}>
                  {busy ? 'Saving…' : 'Start my budget'} <Icon name="check" size={16} />
                </button>
              )}
            </div>
          </section>

          {/* Live preview — computed by the budget engine, not the AI */}
          <aside className="onboarding__preview">
            <span className="eyebrow eyebrow--light">{type === 'baon' ? 'Baon' : 'Sahod'} budget</span>
            <p className="preview__label">Your daily allowance</p>
            <p className="preview__value amount">{validDays && amount > 0 ? formatPeso(daily) : '—'}</p>
            <p className="preview__sub">{validDays ? `per day for ${days} ${dayWord}` : 'Enter the number of days'}</p>

            <dl className="preview__rows">
              <div>
                <dt>Total {type}</dt>
                <dd className="amount">{formatPeso(amount)}</dd>
              </div>
              <div>
                <dt>Fixed expenses</dt>
                <dd className="amount">− {formatPeso(fixedTotal)}</dd>
              </div>
              <div className="is-total">
                <dt>For daily spending</dt>
                <dd className="amount">{formatPeso(Math.max(amount - fixedTotal, 0))}</dd>
              </div>
            </dl>

            <div className="preview__tip">
              <Icon name="sparkle" size={18} />
              <p>
                {!validDays || amount <= 0
                  ? 'Ilagay ang amount at days para makita ang daily allowance mo.'
                  : daily >= 400
                  ? 'Maluwag ang budget mo! Try mong i-save ang 10–20% sa first day pa lang.'
                  : daily >= 200
                  ? "Kasya 'to basta maingat ka. Pasok ang carinderia meals at pamasahe sa jeep."
                  : daily > 0
                  ? 'Medyo tight. Tutulungan ka ng Cashya Ba? na bantayan ang bawat piso.'
                  : 'Ubos na sa fixed expenses ang budget mo. Bawasan mo muna ang mga ito.'}
              </p>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

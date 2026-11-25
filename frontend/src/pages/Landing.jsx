import { useEffect, useMemo, useRef, useState } from 'react';
import Logo from '../components/Logo.jsx';
import Icon from '../components/Icon.jsx';
import { useBudget } from '../context/BudgetContext.jsx';
import { formatPeso } from '../utils/budget.js';
import '../styles/pages/landing.css';

const FEATURES = [
  { icon: 'chat', title: 'Log by chat', text: 'Type "jeep 26, lunch 150" and the AI records and categorizes it. English, Tagalog, or Taglish.', tone: 'lime' },
  { icon: 'calendar', title: 'Auto daily allowance', text: 'Overspend today? Tomorrow adjusts. Your budget always stretches until the next baon or sahod.', tone: 'green' },
  { icon: 'trendUp', title: 'Run-out forecast', text: 'Know early: "At this pace, you\'ll run out on Day 11." Fix it before it happens.', tone: 'blue' },
  { icon: 'book', title: 'Answers with sources', text: 'Ask "Is ₱200/day enough for food in Manila?" and get answers from reference guides, with citations.', tone: 'mantis' },
  { icon: 'bell', title: 'Smart alerts', text: 'Daily allowance, 50/80/100% warnings, and run-out alerts, sent automatically.', tone: 'dark' },
  { icon: 'shield', title: 'Safe by design', text: 'Card numbers are hidden automatically. No investment, loan, or gambling advice.', tone: 'white' },
];

const STEPS = [
  { n: '01', title: 'Set your budget', text: 'Enter your baon or sahod and how many days it has to last.' },
  { n: '02', title: 'Log as you spend', text: 'Chat your expenses like a text message. Takes 3 seconds.' },
  { n: '03', title: 'Ask "Cashya ba?"', text: "See today's allowance, warnings, and tips anytime." },
];

const FAQS = [
  { q: 'Is it free?', a: 'Yes, it is completely free. The AI features also run on a free-tier AI model.' },
  { q: 'Do I need a bank account or e-wallet?', a: 'No. Just type how much your budget is and what you spent it on. The app does not connect to your bank, GCash, or Maya.' },
  { q: 'What if I overspend today?', a: 'Your allowance for the next few days shrinks a little so your money still lasts until your next baon or sahod. If it really will not stretch, you get a warning right away.' },
  { q: 'Is my data safe?', a: 'Yes. Card numbers, mobile numbers, and emails you type in the chat are hidden before they ever reach the AI. Only you (and your parent, in household mode) can see your budget.' },
  { q: "Can I use it for my child's baon?", a: "Yes. In household mode, you set your child's baon and see a summary of their spending. They log their own expenses but cannot change the budget." },
];

const NAV = [
  ['try', 'Try it'],
  ['features', 'Features'],
  ['how', 'How it works'],
  ['faq', 'FAQ'],
];

const PRESETS = {
  baon: { amounts: [500, 1000, 2000, 3000], days: [5, 7, 14, 30], defaultAmount: 1000, defaultDays: 7 },
  sahod: { amounts: [5000, 10000, 15000, 20000], days: [13, 15, 16, 30], defaultAmount: 10000, defaultDays: 15 },
};

const DEMOS = [
  { id: 'log', label: 'jeep 26, lunch 150' },
  { id: 'left', label: 'How much do I have left?' },
  { id: 'afford', label: 'Can I afford ₱1,500 shoes?' },
  { id: 'fare', label: 'How much is the jeepney fare?' },
];

const DRAFT_KEY = 'cashya_draft';
const scrollTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function verdictFor(daily, type) {
  if (daily <= 0) return { tone: 'bad', text: 'Your fixed expenses use up your whole budget. Lower them or shorten the days first.' };
  if (daily >= 400) return { tone: 'good', text: 'Your budget has room! Try saving 10–20% on day one.' };
  if (daily >= 200) return { tone: 'good', text: 'This works if you are careful. Carinderia meals and jeepney fares fit.' };
  if (daily >= (type === 'baon' ? 80 : 150)) return { tone: 'tight', text: 'A bit tight. Pack your lunch and skip the milk tea for now.' };
  return { tone: 'bad', text: 'Very tight. Every peso counts, so Cashya Ba? will help you track it.' };
}

/** Count up/down smoothly to the new number (skipped when reduced motion is on) */
function useAnimatedNumber(value) {
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setShown(value);
      fromRef.current = value;
      return undefined;
    }
    const from = fromRef.current;
    const start = performance.now();
    let frame;
    const tick = (now) => {
      const t = Math.min((now - start) / 350, 1);
      const eased = 1 - (1 - t) ** 3;
      setShown(from + (value - from) * eased);
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = value;
    };
  }, [value]);
  return shown;
}

export default function Landing({ onNavigate }) {
  const { user } = useBudget();

  /* ---------- Calculator ---------- */
  const [type, setType] = useState('sahod');
  const [amount, setAmount] = useState(PRESETS.sahod.defaultAmount);
  const [days, setDays] = useState(PRESETS.sahod.defaultDays);
  const [fixed, setFixed] = useState(0);
  const spendable = Math.max(amount - fixed, 0);
  const daily = days > 0 ? spendable / days : 0;
  const shownDaily = useAnimatedNumber(daily);
  const verdict = verdictFor(daily, type);
  const sliderMax = type === 'baon' ? 5000 : 50000;

  const pickType = (t) => {
    setType(t);
    setAmount(PRESETS[t].defaultAmount);
    setDays(PRESETS[t].defaultDays);
    setFixed(0);
  };

  // Get started carries the calculator values into budget setup
  const start = () => {
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ type, amount, days, fixed }));
    } catch {
      /* storage blocked: onboarding just uses its defaults */
    }
    onNavigate(user ? 'onboarding' : 'login?signup');
  };

  /* ---------- Phone demo ---------- */
  const [chat, setChat] = useState([]);
  const [spentToday, setSpentToday] = useState(0);
  const [typing, setTyping] = useState(false);
  const timers = useRef([]);
  const leftToday = daily - spentToday;

  // Reset the demo whenever the calculator changes
  useEffect(() => {
    setChat([]);
    setSpentToday(0);
  }, [type, amount, days, fixed]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const replyFor = (id) => {
    if (id === 'log') {
      const left = leftToday - 176;
      return {
        spend: 176,
        text:
          left >= 0
            ? `Logged 2 expenses (₱176). You have ${formatPeso(left)} left for today.`
            : `Logged 2 expenses (₱176). You went ${formatPeso(-left)} over today, so tomorrow's budget will adjust a little.`,
      };
    }
    if (id === 'left') {
      return { text: `You have ${formatPeso(spendable - spentToday)} left for the next ${days} days. You can still spend ${formatPeso(Math.max(leftToday, 0))} today.` };
    }
    if (id === 'afford') {
      const after = spendable - spentToday - 1500;
      const perDay = after / Math.max(days - 1, 1);
      return {
        text:
          after > 0 && perDay >= daily * 0.6
            ? `You can! After buying them, you will still have about ${formatPeso(perDay)} per day.`
            : `A bit risky. Your budget would drop to ${formatPeso(Math.max(perDay, 0))} per day. Better to save for it as a goal first.`,
      };
    }
    return { text: 'The minimum jeepney fare is ₱13 for the first 4 km.', source: 'Fares Guide' };
  };

  const playDemo = (demo) => {
    if (typing) return;
    timers.current.forEach(clearTimeout);
    const reply = replyFor(demo.id);
    setChat((c) => [...c.slice(-1), { from: 'me', text: demo.label }]);
    setTyping(true);
    timers.current = [
      setTimeout(
        () => {
          setTyping(false);
          if (reply.spend) setSpentToday((s) => s + reply.spend);
          setChat((c) => [...c.slice(-1), { from: 'ai', text: reply.text, source: reply.source }]);
        },
        prefersReducedMotion() ? 0 : 700
      ),
    ];
  };

  /* ---------- Nav: shadow on scroll + current section ---------- */
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState('');
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' }
    );
    NAV.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => {
      window.removeEventListener('scroll', onScroll);
      io.disconnect();
    };
  }, []);

  /* ---------- Reveal sections on scroll ----------
     A position check on every scroll (not IntersectionObserver) so that jumping
     straight to a section from the nav can never leave content invisible. */
  useEffect(() => {
    const pending = new Set(document.querySelectorAll('.reveal'));
    const showAll = () => pending.forEach((el) => el.classList.add('is-visible'));
    if (prefersReducedMotion()) {
      showAll();
      return undefined;
    }
    const check = () => {
      pending.forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight * 0.92) {
          el.classList.add('is-visible');
          pending.delete(el);
        }
      });
      if (!pending.size) window.removeEventListener('scroll', check);
    };
    check();
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    return () => {
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, []);

  const tryMode = (t) => {
    pickType(t);
    scrollTo('try');
  };

  const statusText = useMemo(() => (leftToday >= 0 ? 'On track!' : 'Over budget today'), [leftToday]);

  return (
    <div className="landing">
      {/* ---------- Nav ---------- */}
      <header className={`landing-nav ${scrolled ? 'is-scrolled' : ''}`}>
        <div className="landing-nav__inner">
          <button className="landing-nav__logo" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top">
            <Logo size="lg" />
          </button>
          <nav className="landing-nav__links" aria-label="Sections">
            {NAV.map(([id, label]) => (
              <button key={id} className={active === id ? 'is-active' : ''} onClick={() => scrollTo(id)}>
                {label}
              </button>
            ))}
          </nav>
          <div className="landing-nav__actions">
            <button className="btn btn-ghost btn-sm" onClick={() => onNavigate(user ? 'dashboard' : 'login')}>
              {user ? 'Dashboard' : 'Sign in'}
            </button>
            <button className="btn btn-dark btn-sm" onClick={start}>
              Get started
            </button>
          </div>
        </div>
      </header>

      <div className="landing__frame">
        {/* ---------- Hero ---------- */}
        <section className="hero">
          <div className="hero__left">
            <div className="hero__card">
              <span className="eyebrow">AI budget buddy for every Filipino</span>
              <h1>
                Make every <mark>peso</mark> last until the next baon or sahod.
              </h1>
              <p>
                Tell Cashya Ba? how much you have and how many days it needs to last. It plans your daily allowance, tracks
                every expense, and warns you before you run out.
              </p>
              <div className="hero__ctas">
                <button className="btn btn-dark" onClick={start}>
                  Get started, free
                </button>
                <button className="btn btn-ghost" onClick={() => scrollTo('try')}>
                  Try the calculator <Icon name="arrowRight" size={16} />
                </button>
              </div>
            </div>

            {/* Live calculator */}
            <div className="calc" id="try">
              <div className="calc__head">
                <h2>Cashya ba?</h2>
                <div className="segmented" role="radiogroup" aria-label="Budget type">
                  {['baon', 'sahod'].map((t) => (
                    <button key={t} role="radio" aria-checked={type === t} className={type === t ? 'is-active' : ''} onClick={() => pickType(t)}>
                      {t === 'baon' ? 'Baon' : 'Sahod'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="calc__grid">
                <div className="calc__inputs">
                  <label className="calc__field">
                    <span>How much?</span>
                    <div className="calc__money">
                      <span>₱</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(Math.max(Number(e.target.value) || 0, 0))}
                        aria-label="Budget amount in pesos"
                      />
                    </div>
                    <input
                      type="range"
                      min="0"
                      max={sliderMax}
                      step={type === 'baon' ? 50 : 500}
                      value={Math.min(amount, sliderMax)}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      aria-label="Budget amount slider"
                    />
                  </label>

                  <div className="calc__field">
                    <span>For how many days?</span>
                    <div className="calc__chips">
                      {PRESETS[type].days.map((d) => (
                        <button key={d} className={`chip ${days === d ? 'is-active' : ''}`} onClick={() => setDays(d)}>
                          {d} days
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="calc__field">
                    <span>Rent, bills, or other fixed costs (optional)</span>
                    <div className="calc__money calc__money--sm">
                      <span>₱</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        value={fixed || ''}
                        placeholder="0"
                        onChange={(e) => setFixed(Math.max(Number(e.target.value) || 0, 0))}
                        aria-label="Fixed expenses in pesos"
                      />
                    </div>
                  </label>
                </div>

                <div className={`calc__result calc__result--${verdict.tone}`} aria-live="polite">
                  <span>You can spend</span>
                  <strong className="amount">{formatPeso(shownDaily)}</strong>
                  <span>per day for {days} days</span>
                  <p>{verdict.text}</p>
                  <button className="btn btn-dark btn-sm" onClick={start}>
                    Start with this budget <Icon name="arrowRight" size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Visual + playable phone demo */}
          <div className="hero__visual">
            <div className="hero__scene" aria-hidden="true">
              <span className="hero__sun" />
              <span className="hero__hill hero__hill--1" />
              <span className="hero__hill hero__hill--2" />
              <span className="hero__hill hero__hill--3" />
            </div>

            <span className="float float--square" aria-hidden="true">
              <Icon name="leaf" size={22} />
              For baon
            </span>
            <span className="float float--circle" aria-hidden="true">
              Sahod mode
            </span>
            <span className="float float--triangle" aria-hidden="true">
              It fits!
            </span>

            <div className="hero__phone">
              <div className="phone__top">
                <small>Left today</small>
                <strong className="amount">{formatPeso(Math.max(leftToday, 0))}</strong>
                <span className={`phone__ok ${leftToday < 0 ? 'is-over' : ''}`}>
                  <Icon name={leftToday < 0 ? 'alert' : 'check'} size={13} strokeWidth={2.6} /> {statusText}
                </span>
              </div>

              <div className="phone__chat" aria-live="polite">
                {chat.length === 0 && !typing && <p className="phone__hint">Tap a message below to try it.</p>}
                {chat.map((m, i) => (
                  <div key={`${i}-${m.text}`} className={`phone__bubble phone__bubble--${m.from}`}>
                    {m.text}
                    {m.source && <small>Source: {m.source}</small>}
                  </div>
                ))}
                {typing && (
                  <div className="phone__bubble phone__bubble--ai phone__typing" aria-label="Cashya is typing">
                    <i />
                    <i />
                    <i />
                  </div>
                )}
              </div>

              <div className="phone__try">
                {DEMOS.map((d) => (
                  <button key={d.id} onClick={() => playDemo(d)} disabled={typing}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ---------- Features ---------- */}
      <section className="section" id="features">
        <div className="section__head reveal">
          <span className="eyebrow">Features</span>
          <h2>Everything you need to make your budget last</h2>
        </div>
        <div className="features">
          {FEATURES.map((f, i) => (
            <article key={f.title} className={`feature feature--${f.tone} reveal`} style={{ '--delay': `${(i % 3) * 80}ms` }}>
              <span className="feature__icon">
                <Icon name={f.icon} size={22} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="section" id="how">
        <div className="section__head reveal">
          <span className="eyebrow">How it works</span>
          <h2>Just three steps. No spreadsheet needed.</h2>
        </div>
        <div className="steps">
          {STEPS.map((s, i) => (
            <article key={s.n} className="step reveal" style={{ '--delay': `${i * 100}ms` }}>
              <span className="step__n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </article>
          ))}
        </div>

        <div className="audience">
          <article className="audience__card audience__card--baon reveal">
            <span className="eyebrow">For students</span>
            <h3>Baon mode</h3>
            <p>Weekly or monthly baon from parents? Plan it per day, track load and fares, and save for the things you want.</p>
            <button className="btn btn-dark btn-sm" onClick={() => tryMode('baon')}>
              Try with my baon <Icon name="arrowRight" size={14} />
            </button>
          </article>
          <article className="audience__card audience__card--sahod reveal" style={{ '--delay': '100ms' }}>
            <span className="eyebrow">For workers</span>
            <h3>Sahod mode</h3>
            <p>Paid every 15th and 30th? Set aside rent and bills first, then see exactly how much you can spend each day.</p>
            <button className="btn btn-lime btn-sm" onClick={() => tryMode('sahod')}>
              Try with my sahod <Icon name="arrowRight" size={14} />
            </button>
          </article>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section className="section faq-layout" id="faq">
        <div className="section__head reveal">
          <span className="eyebrow">FAQ</span>
          <h2>Got questions?</h2>
          <p>Quick answers about cost, privacy, and how your budget adjusts.</p>
        </div>
        <div className="faq reveal">
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <Icon name="plus" size={18} />
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ---------- CTA ---------- */}
      <section className="section">
        <div className="cta reveal">
          <h2>Baon man o sahod, pagkasyahin natin.</h2>
          <p>Start your first budget in under a minute.</p>
          <button className="btn btn-lime" onClick={start}>
            Start my budget <Icon name="arrowRight" size={16} />
          </button>
        </div>
      </section>
    </div>
  );
}

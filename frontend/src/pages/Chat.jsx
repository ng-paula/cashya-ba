import { useEffect, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout.jsx';
import Icon from '../components/Icon.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { api } from '../api/client.js';
import { useBudget } from '../context/BudgetContext.jsx';
import { formatPeso } from '../utils/budget.js';
import '../styles/pages/chat.css';

const SUGGESTIONS = [
  'jeep 26, lunch 150',
  'Magkano pa ang natitira ko?',
  'Afford ko ba ang ₱1,500 na shoes?',
  'Magkano pamasahe sa jeep?',
  'Saan napunta pera ko?',
];

const FLAG_NOTE = {
  pii: 'Personal info hidden',
  injection: 'Blocked: tried to change the rules',
  off_limits: 'Outside what Cashya can advise on',
};

const DETAILS_KEY = 'cashya_show_ai_details';
const readDetailsPref = () => {
  try {
    return localStorage.getItem(DETAILS_KEY) === '1';
  } catch {
    return false;
  }
};

const formatArgs = (t) =>
  t.name === 'add_expense'
    ? `${formatPeso(t.args.amount)}, "${t.args.category}"`
    : Object.values(t.args)
        .map((v) => (typeof v === 'string' ? `"${v.slice(0, 30)}"` : v))
        .join(', ');

export default function Chat({ onNavigate, current }) {
  const { summary, sendChat, user } = useBudget();
  const welcome = {
    id: 'welcome',
    from: 'ai',
    text: `Hi ${user.name}! I-type mo lang ang expenses mo (e.g. "jeep 26, lunch 150"), o itanong kung kasya pa ang budget mo.`,
  };
  const [messages, setMessages] = useState([welcome]);
  const [confirm, confirmDialog] = useConfirm();
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [mode, setMode] = useState(null);
  const [showDetails, setShowDetails] = useState(readDetailsPref);
  const listRef = useRef(null);

  useEffect(() => {
    api
      .chatHistory()
      .then((rows) => {
        if (!rows.length) return;
        setMessages([
          welcome,
          ...rows.map((r) => ({
            id: r.id,
            from: r.role === 'user' ? 'me' : 'ai',
            text: r.content,
            flags: r.meta.flags,
            toolCalls: r.meta.toolCalls,
            sources: r.meta.sources,
          })),
        ]);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, typing]);

  const toggleDetails = () => {
    setShowDetails((v) => {
      try {
        localStorage.setItem(DETAILS_KEY, v ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !v;
    });
  };

  const send = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || typing) return;
    const tempId = `me-${Date.now()}`;
    setMessages((m) => [...m, { id: tempId, from: 'me', text: trimmed }]);
    setInput('');
    setTyping(true);

    try {
      const res = await sendChat(trimmed);
      setMode(res.mode);
      setMessages((m) => [
        // Replace what the user typed with the masked version (PII never stays on screen)
        ...m.map((msg) => (msg.id === tempId ? { ...msg, text: res.cleanText, flags: res.flags } : msg)),
        { id: `ai-${Date.now()}`, from: 'ai', text: res.reply, toolCalls: res.toolCalls, sources: res.sources },
      ]);
    } catch (err) {
      setMessages((m) => [...m, { id: `err-${Date.now()}`, from: 'ai', text: err.message, isError: true }]);
    } finally {
      setTyping(false);
    }
  };

  const clear = async () => {
    const ok = await confirm({ title: 'Clear this conversation?', text: 'Your logged expenses stay saved.', confirmLabel: 'Clear chat', danger: true });
    if (!ok) return;
    await api.clearChat().catch(() => {});
    setMessages([welcome]);
  };

  const usedPct = Math.min((summary.spentToday / Math.max(summary.todayAllowance, 1)) * 100, 100);

  return (
    <AppLayout current={current} onNavigate={onNavigate} title="AI Chat" subtitle="English, Tagalog, or Taglish">
      <section className="chat-layout">
        <article className="card chat">
          <header className="chat__head">
            <div className="chat__today">
              <span className="muted">Left today</span>
              <strong className="amount">{formatPeso(Math.max(summary.leftToday, 0))}</strong>
              <div className="progress chat__today-bar">
                <span style={{ width: `${usedPct}%`, background: summary.leftToday < 0 ? 'var(--red)' : 'var(--book-green)' }} />
              </div>
            </div>
            <div className="chat__head-actions">
              <label className="chat__toggle">
                <input type="checkbox" checked={showDetails} onChange={toggleDetails} />
                AI details
              </label>
              <button className="icon-btn" onClick={clear} aria-label="Clear conversation" title="Clear conversation">
                <Icon name="trash" size={17} />
              </button>
            </div>
          </header>

          <div className="chat__messages" ref={listRef}>
            {messages.map((m) => (
              <div key={m.id} className={`msg msg--${m.from} ${m.isError ? 'msg--error' : ''}`}>
                <div className="msg__bubble">{m.text}</div>

                {m.from === 'me' && m.flags?.length > 0 && (
                  <p className="msg__note">
                    <Icon name="shield" size={12} /> {m.flags.map((f) => FLAG_NOTE[f] || f).join(' · ')}
                  </p>
                )}

                {m.sources?.length > 0 && (
                  <p className="msg__note msg__note--source">
                    <Icon name="book" size={12} /> {m.sources.map((s, i) => `[${i + 1}] ${s}`).join(' · ')}
                  </p>
                )}

                {showDetails && m.toolCalls?.length > 0 && (
                  <div className="msg__tools">
                    {m.toolCalls.map((t, i) => (
                      <code key={i} title={JSON.stringify(t.args)}>
                        {t.name}({formatArgs(t)})
                      </code>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {typing && (
              <div className="msg msg--ai">
                <div className="msg__bubble typing" aria-label="Cashya is typing">
                  <i />
                  <i />
                  <i />
                </div>
              </div>
            )}
          </div>

          <div className="chat__suggestions">
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)} disabled={typing}>
                {s}
              </button>
            ))}
          </div>

          <form
            className="chat__input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
            <input
              className="input"
              value={input}
              maxLength={1000}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type an expense or a question"
              aria-label="Message"
            />
            <button type="submit" className="send-btn" aria-label="Send" disabled={!input.trim() || typing}>
              <Icon name="send" size={18} />
            </button>
          </form>
          {mode === 'rules' && <p className="chat__mode">AI is unavailable right now, so replies use offline mode.</p>}
        </article>

        <aside className="card chat-help">
          <h3>Try saying</h3>
          <ul>
            <li>"lunch 150, jeep 26" to log expenses</li>
            <li>"magkano pa?" to check your budget</li>
            <li>"kaya ko ba bumili ng ₱1500?"</li>
            <li>"burahin yung last" to undo</li>
          </ul>
          <h3>Cashya won't</h3>
          <ul className="is-no">
            <li>Give investment, crypto, or loan advice</li>
            <li>Help with gambling</li>
            <li>Change your budget through chat</li>
          </ul>
        </aside>
      </section>
      {confirmDialog}
    </AppLayout>
  );
}

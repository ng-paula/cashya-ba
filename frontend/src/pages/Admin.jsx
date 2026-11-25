import { useEffect, useRef, useState } from 'react';
import AppLayout from '../components/AppLayout.jsx';
import StatCard from '../components/StatCard.jsx';
import Icon from '../components/Icon.jsx';
import { useConfirm } from '../components/ConfirmDialog.jsx';
import { api } from '../api/client.js';
import { useBudget } from '../context/BudgetContext.jsx';
import '../styles/pages/dashboard.css';
import '../styles/pages/admin.css';

const ACTION_PILL = { Blocked: 'tag--red', Redacted: 'tag--blue', Refused: 'tag--amber' };
const STATUS_PILL = { sent: 'tag--green', failed: 'tag--red', skipped: '' };
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const fmtTime = (iso) => new Date(iso).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function EvalCards({ evaluation }) {
  if (!evaluation) {
    return (
      <article className="card metric metric--empty">
        <p className="muted">Evaluation</p>
        <strong>Not run yet</strong>
        <small>
          Run <code>python -m eval.run_eval</code> in <code>backend/</code> to measure accuracy.
        </small>
      </article>
    );
  }
  const g = evaluation.guardrails;
  const cards = [
    { label: 'Categorization accuracy', value: pct(evaluation.categorization.accuracy), note: `${evaluation.categorization.correct}/${evaluation.categorization.total} test expenses (EN / TL / Taglish)` },
    { label: 'RAG retrieval hit@3', value: pct(evaluation.retrieval.hitAt3), note: `MRR ${evaluation.retrieval.mrr} · ${evaluation.retrieval.total} questions` },
    { label: 'Out-of-scope rejected', value: `${evaluation.outOfScope.rejected}/${evaluation.outOfScope.total}`, note: 'No source → no answer (anti-hallucination)' },
    { label: 'Guardrail detection', value: `${g.attacksCaught}/${g.attacksTotal}`, note: `Benign allowed ${g.benignAllowed}/${g.benignTotal} · PII masked ${g.piiMasked}/${g.piiTotal}` },
  ];
  return cards.map((m) => (
    <article key={m.label} className="card metric">
      <p className="muted">{m.label}</p>
      <strong className="amount">{m.value}</strong>
      <small>{m.note}</small>
      <small className="metric__run">
        {evaluation.mode} mode · {fmtTime(evaluation.runAt)}
      </small>
    </article>
  ));
}

export default function Admin({ onNavigate, current }) {
  const { user } = useBudget();
  const [metrics, setMetrics] = useState(null);
  const [docs, setDocs] = useState([]);
  const [flags, setFlags] = useState([]);
  const [events, setEvents] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirm, confirmDialog] = useConfirm();
  const fileRef = useRef(null);
  const isAdmin = user.role === 'admin';

  const load = async () => {
    try {
      const [m, d, f, e, u] = await Promise.all([
        api.adminMetrics(),
        api.adminDocs(),
        api.adminGuardrails(),
        api.adminAutomation(),
        api.adminUsers(),
      ]);
      setMetrics(m);
      setDocs(d);
      setFlags(f);
      setEvents(e);
      setUsers(u);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // RBAC: the backend also rejects non-admins (403); this is just the friendly screen
  if (!isAdmin) {
    return (
      <AppLayout current={current} onNavigate={onNavigate} title="Admin Panel">
        <article className="card admin-denied">
          <Icon name="shield" size={36} />
          <h2>Admins only</h2>
          <p className="muted">Your role ({user.role}) cannot open the admin panel.</p>
          <button className="btn btn-dark" onClick={() => onNavigate('dashboard')}>
            Back to dashboard
          </button>
        </article>
      </AppLayout>
    );
  }

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      await api.adminUpload(file);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeDoc = async (doc) => {
    const ok = await confirm({ title: `Delete "${doc.title}"?`, text: 'This removes it from the knowledge base, including the file.', confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    try {
      await api.adminDeleteDoc(doc.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const search = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    try {
      setResults(await api.adminSearch(query));
    } catch (err) {
      setError(err.message);
    }
  };

  const changeRole = async (id, role) => {
    try {
      await api.adminSetRole(id, role);
      setUsers((us) => us.map((u) => (u.id === id ? { ...u, role } : u)));
    } catch (err) {
      setError(err.message);
    }
  };

  const usage = metrics?.usage;
  const ai = metrics?.ai;
  const series = metrics?.latencySeries || [];
  const maxLatency = Math.max(...series.map((d) => d.value), 0.1);

  return (
    <AppLayout
      current={current}
      onNavigate={onNavigate}
      title="Admin Panel"
      subtitle={ai ? `AI model: ${ai.model}` : 'Knowledge base, AI quality, and guardrails'}
    >
      {error && <p className="form-error">{error}</p>}

      <section className="dash-kpis">
        <StatCard variant="highlight" icon="users" value={usage?.activeUsers ?? '–'} label="Active users (30 days)" sub={usage ? `${usage.totalUsers} accounts total` : ''} />
        <StatCard icon="receipt" value={usage?.expensesToday ?? '–'} label="Expenses logged today" />
        <StatCard icon="chat" value={usage?.chatsToday ?? '–'} label="AI chats today" sub={ai ? `${ai.chatsThisWeek} this week · ${ai.tokensThisWeek.toLocaleString()} tokens` : ''} />
        <StatCard icon="book" value={usage?.kbChunks ?? '–'} label="Indexed KB chunks" sub={`${docs.length} documents`} />
      </section>

      <section className="admin-metrics">
        <EvalCards evaluation={metrics?.evaluation} />
      </section>

      <section className="admin-grid">
        {/* Knowledge base */}
        <article className="card">
          <header className="card-header">
            <h2 className="card-title">
              Knowledge base (RAG)
            </h2>
            <input ref={fileRef} type="file" accept=".md,.txt,.pdf" hidden onChange={upload} />
            <button className="btn btn-dark btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
              <Icon name="upload" size={15} /> {uploading ? 'Indexing…' : 'Upload .md / .txt / .pdf'}
            </button>
          </header>
          <div className="table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Type</th>
                  <th>Chunks</th>
                  <th>Updated</th>
                  <th>Status</th>
                  <th aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id}>
                    <td>{d.title}</td>
                    <td>
                      {d.fileType}
                    </td>
                    <td className="amount">{d.chunks}</td>
                    <td className="faint">{fmtTime(d.updatedAt)}</td>
                    <td>
                      <span className={`tag ${d.status === 'Indexed' ? 'tag--green' : 'tag--amber'}`}>{d.status}</span>
                    </td>
                    <td>
                      <button className="exp-row__del admin-del" onClick={() => removeDoc(d)} aria-label={`Delete ${d.title}`}>
                        <Icon name="trash" size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form className="admin-search" onSubmit={search}>
            <Icon name="search" size={16} />
            <input placeholder="Test retrieval: e.g. magkano pamasahe sa jeep?" value={query} onChange={(e) => setQuery(e.target.value)} />
            <button className="btn btn-light btn-sm" type="submit">
              Search
            </button>
          </form>
          {results && (
            <ol className="admin-results">
              {results.length === 0 && <li className="muted">No relevant chunk found — the AI would say it has no reliable source.</li>}
              {results.map((r) => (
                <li key={r.chunk_id}>
                  <strong>
                    {r.title} — {r.heading}
                  </strong>
                  <span className="faint"> score {r.score}</span>
                  <p>{r.text.slice(0, 220)}…</p>
                </li>
              ))}
            </ol>
          )}
        </article>

        {/* Latency chart */}
        <article className="card">
          <header className="card-header">
            <h2 className="card-title">Response time</h2>
            <span className="muted admin-note">Last 7 days</span>
          </header>
          <div className="latency">
            {series.map((d, i) => (
              <div key={i} className="latency__col">
                <small>{d.value ? `${d.value}s` : '–'}</small>
                <span style={{ height: `${(d.value / maxLatency) * 100}%` }} />
                <em>{d.label}</em>
              </div>
            ))}
          </div>
          <p className="muted latency__note">
            Avg {ai ? (ai.avgLatencyMs / 1000).toFixed(2) : '–'}s · p95 {ai ? (ai.p95LatencyMs / 1000).toFixed(2) : '–'}s · target under 3s
          </p>
          {ai && Object.keys(ai.intents).length > 0 && (
            <div className="intent-list">
              <p className="muted">Top intents this week</p>
              {Object.entries(ai.intents)
                .slice(0, 5)
                .map(([k, v]) => (
                  <span key={k}>
                    {k} <strong>{v}</strong>
                  </span>
                ))}
            </div>
          )}
        </article>
      </section>

      {/* Guardrail log */}
      <article className="card">
        <header className="card-header">
          <h2 className="card-title">
            Guardrail activity
          </h2>
          <span className="muted admin-note">{flags.length} flagged</span>
        </header>
        {flags.length === 0 && <p className="muted">Nothing flagged yet. Try a prompt injection in the AI Chat.</p>}
        <ul className="flag-list">
          {flags.map((f) => (
            <li key={f.id}>
              <strong className="flag-type">{f.type}</strong>
              <p>"{f.text}"</p>
              <small className="faint">
                {f.user} · {fmtTime(f.time)}
              </small>
              <span className={`tag ${ACTION_PILL[f.action] || ''}`}>{f.action}</span>
            </li>
          ))}
        </ul>
      </article>

      <section className="admin-grid admin-grid--even">
        {/* Automation events */}
        <article className="card">
          <header className="card-header">
            <h2 className="card-title">
              Automation (webhooks)
            </h2>
          </header>
          {events.length === 0 && <p className="muted">No events yet. They fire when a user crosses 50/80/100% of a budget.</p>}
          <ul className="flag-list flag-list--compact">
            {events.map((e) => (
              <li key={e.id}>
                <strong className="flag-type">{e.event}</strong>
                <p>{e.message}</p>
                <small className="faint">{fmtTime(e.time)}</small>
                <span className={`tag ${STATUS_PILL[e.status]}`}>{e.status}</span>
              </li>
            ))}
          </ul>
        </article>

        {/* Users & roles */}
        <article className="card">
          <header className="card-header">
            <h2 className="card-title">
              Users & roles (RBAC)
            </h2>
          </header>
          <ul className="set-list">
            {users.map((u) => (
              <li key={u.id}>
                <div>
                  <strong>{u.fullName}</strong>
                  <small>{u.email}</small>
                </div>
                <select className="input role-select" value={u.role} onChange={(e) => changeRole(u.id, e.target.value)} disabled={u.id === user.id}>
                  <option value="user">User</option>
                  <option value="parent">Parent</option>
                  <option value="child">Child</option>
                  <option value="admin">Admin</option>
                </select>
              </li>
            ))}
          </ul>
        </article>
      </section>
      {confirmDialog}
    </AppLayout>
  );
}

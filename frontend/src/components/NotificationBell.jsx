import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import { api } from '../api/client.js';
import { useBudget } from '../context/BudgetContext.jsx';

/* Other pages can ask the bell to refresh (e.g. after "Send test alert") */
export const refreshAlerts = () => window.dispatchEvent(new Event('cashya:alerts'));

const TONE_ICON = { red: 'alert', amber: 'alert', green: 'calendar', neutral: 'bell' };

function timeAgo(iso) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs > 1 ? 's' : ''} ago`;
  return new Date(iso).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
}

/** Bell in the top bar: budget alerts the backend raised (the same ones sent out by webhook) */
export default function NotificationBell() {
  const { expenses } = useBudget();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const load = useCallback(() => {
    api.getNotifications().then(setItems).catch(() => {});
  }, []);

  // Reload whenever expenses change (form or AI chat) — that's when alerts fire
  useEffect(load, [load, expenses.length]);
  useEffect(() => {
    window.addEventListener('cashya:alerts', load);
    return () => window.removeEventListener('cashya:alerts', load);
  }, [load]);

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => wrapRef.current && !wrapRef.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const unread = items.filter((n) => !n.read).length;

  // Read state is saved on the server, so it follows the account across devices
  const markRead = (n) => {
    if (n.read) return;
    setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    api.markNotificationRead(n.id).catch(load);
  };
  const markAllRead = () => {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    api.markAllNotificationsRead().catch(load);
  };

  return (
    <div className="notif" ref={wrapRef}>
      <button
        className={`topbar__icon-btn ${open ? 'is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Alerts, ${unread} new` : 'Alerts'}
        aria-expanded={open}
        title="Alerts"
      >
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="notif__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && (
        <div className="notif__panel" role="dialog" aria-label="Alerts">
          <header className="notif__head">
            <strong>Alerts</strong>
            {unread > 0 && (
              <button className="notif__readall" onClick={markAllRead}>
                <Icon name="check" size={14} /> Mark all read
              </button>
            )}
          </header>

          {items.length === 0 ? (
            <div className="notif__empty">
              <Icon name="bell" size={22} />
              <p>No alerts yet. You'll get one when you hit 50%, 80%, or 100% of your budget.</p>
            </div>
          ) : (
            <ul className="notif__list">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    className={`notif__item notif__item--${n.tone} ${n.read ? '' : 'is-new'}`}
                    onClick={() => markRead(n)}
                    aria-label={`${n.title}. ${n.message}${n.read ? '' : ' Unread, click to mark as read.'}`}
                    title={n.read ? undefined : 'Mark as read'}
                  >
                    <span className="notif__icon">
                      <Icon name={TONE_ICON[n.tone] || 'bell'} size={15} />
                    </span>
                    <span className="notif__text">
                      <strong>{n.title}</strong>
                      <span className="notif__msg">{n.message}</span>
                      <small>{timeAgo(n.createdAt)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

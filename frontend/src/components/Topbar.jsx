import Icon from './Icon.jsx';
import NotificationBell from './NotificationBell.jsx';
import { useBudget } from '../context/BudgetContext.jsx';

const ROLE_LABELS = { user: 'Personal', parent: 'Parent', child: 'Child', admin: 'Admin' };

/** Page title + optional action (e.g. a button) + signed-in user */
export default function Topbar({ title, subtitle, action, onNavigate }) {
  const { user, logout } = useBudget();

  const signOut = () => {
    logout();
    onNavigate('landing');
  };

  return (
    <header className="topbar">
      <div className="topbar__heading">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      <div className="topbar__actions">
        {action}
        <NotificationBell />
        <button className="topbar__user" onClick={() => onNavigate('settings')} aria-label={`Account settings for ${user.fullName}`} title={user.email}>
          <span className="topbar__avatar">{user.initials}</span>
          <span className="topbar__user-text">
            <strong>{user.name}</strong>
            <small>{ROLE_LABELS[user.role] || 'Account'}</small>
          </span>
        </button>
        <button className="topbar__logout" onClick={signOut} aria-label="Sign out" title="Sign out">
          <Icon name="logout" size={17} />
        </button>
      </div>
    </header>
  );
}

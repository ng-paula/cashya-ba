import Icon from './Icon.jsx';
import Logo from './Logo.jsx';
import { useBudget } from '../context/BudgetContext.jsx';

export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Home', icon: 'home' },
  { id: 'chat', label: 'AI Chat', icon: 'chat' },
  { id: 'expenses', label: 'Expenses', icon: 'list' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'goals', label: 'Goals', icon: 'target' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export default function Sidebar({ current, onNavigate }) {
  const { user, summary } = useBudget();
  const items = user.role === 'admin' ? [...NAV_ITEMS, { id: 'admin', label: 'Admin', icon: 'shield' }] : NAV_ITEMS;

  return (
    <aside className="sidebar">
      <button className="sidebar__logo" onClick={() => onNavigate('landing')} aria-label="Cashya Ba? home page">
        <Logo />
      </button>

      <nav className="sidebar__nav" aria-label="Main">
        {items.map((item) => (
          <button
            key={item.id}
            className={`sidebar__link ${current === item.id ? 'is-active' : ''}`}
            onClick={() => onNavigate(item.id)}
            aria-current={current === item.id ? 'page' : undefined}
            title={item.label}
          >
            <Icon name={item.icon} size={19} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {summary && user.role !== 'child' && (
        <div className="sidebar__promo">
          <p className="sidebar__promo-days">
            <strong>{summary.daysLeft}</strong> {summary.daysLeft === 1 ? 'day' : 'days'} left
          </p>
          <p>until your next {summary.type}</p>
          <button className="btn btn-dark btn-sm btn-block" onClick={() => onNavigate('onboarding')}>
            <Icon name="plus" size={15} /> New budget
          </button>
        </div>
      )}
    </aside>
  );
}

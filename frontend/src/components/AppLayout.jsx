import Sidebar, { NAV_ITEMS } from './Sidebar.jsx';
import Topbar from './Topbar.jsx';
import Icon from './Icon.jsx';
import '../styles/layout.css';

/** Shell for all signed-in pages: sidebar (desktop) / bottom nav (phone) + topbar */
export default function AppLayout({ current, onNavigate, title, subtitle, action, children }) {
  return (
    <div className="app-frame">
      <div className="app-shell">
        <Sidebar current={current} onNavigate={onNavigate} />
        <main className="app-main">
          <Topbar title={title} subtitle={subtitle} action={action} onNavigate={onNavigate} />
          <div className="app-content">{children}</div>
        </main>
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {NAV_ITEMS.slice(0, 5).map((item) => (
          <button
            key={item.id}
            className={current === item.id ? 'is-active' : ''}
            onClick={() => onNavigate(item.id)}
            aria-current={current === item.id ? 'page' : undefined}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

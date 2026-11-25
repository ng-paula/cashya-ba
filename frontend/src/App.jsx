/* ==========================================================
   App — hash router (#/dashboard, #/chat, ...) with route guards:
   - signed-out users are sent to #/login
   - pages that need a budget show a "set up your budget" screen
   ========================================================== */
import { useEffect, useState } from 'react';
import { useBudget } from './context/BudgetContext.jsx';
import AppLayout from './components/AppLayout.jsx';
import Icon from './components/Icon.jsx';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import Onboarding from './pages/Onboarding.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Chat from './pages/Chat.jsx';
import Expenses from './pages/Expenses.jsx';
import Insights from './pages/Insights.jsx';
import Goals from './pages/Goals.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';

const ROUTES = {
  landing: Landing,
  login: Login,
  onboarding: Onboarding,
  dashboard: Dashboard,
  chat: Chat,
  expenses: Expenses,
  insights: Insights,
  goals: Goals,
  settings: Settings,
  admin: Admin,
};
const PUBLIC = ['landing', 'login'];
const NEEDS_BUDGET = ['dashboard', 'chat', 'expenses', 'insights'];

const readRoute = () => {
  const r = window.location.hash.replace(/^#\/?/, '').split('?')[0];
  return ROUTES[r] ? r : 'landing';
};

function NoBudget({ onNavigate, current, isChild }) {
  return (
    <AppLayout current={current} onNavigate={onNavigate} title="Welcome!" subtitle="Let's set up your first budget">
      <article className="card empty-state">
        <span className="empty-state__icon">
          <Icon name="wallet" size={30} />
        </span>
        <h2>{isChild ? 'Waiting for your baon' : 'Wala ka pang budget'}</h2>
        <p className="muted">
          {isChild
            ? 'Your parent sets your baon in household mode. Once they do, your daily allowance will show here.'
            : 'Tell us how much your baon or sahod is and how many days it should last.'}
        </p>
        {!isChild && (
          <button className="btn btn-dark" onClick={() => onNavigate('onboarding')}>
            Set up my budget <Icon name="arrowRight" size={16} />
          </button>
        )}
      </article>
    </AppLayout>
  );
}

export default function App() {
  const { user, budget, loading } = useBudget();
  const [route, setRoute] = useState(readRoute);

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = (to) => {
    window.location.hash = `/${to}`;
  };

  // Signed-out users can only see public pages
  useEffect(() => {
    if (!loading && !user && !PUBLIC.includes(route)) navigate('login');
  }, [loading, user, route]);

  if (loading) {
    return (
      <div className="app-loading">
        <span className="spinner" aria-label="Loading" />
      </div>
    );
  }
  if (!user && !PUBLIC.includes(route)) return null;

  if (user && NEEDS_BUDGET.includes(route) && !budget) {
    return <NoBudget onNavigate={navigate} current={route} isChild={user.role === 'child'} />;
  }

  const Page = ROUTES[route];
  return <Page onNavigate={navigate} current={route} />;
}

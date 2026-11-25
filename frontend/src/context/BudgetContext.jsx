/* ==========================================================
   BudgetContext — app state loaded from the backend API.
   The summary (allowance, forecast) is computed locally with the
   same formulas the backend uses (utils/budget.js ⇄ budget_engine.py)
   so the UI updates instantly after each change.
   ========================================================== */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../api/client.js';
import { getBudgetSummary } from '../utils/budget.js';

const BudgetContext = createContext(null);

const decorateUser = (u) => {
  if (!u) return null;
  const parts = u.fullName.trim().split(/\s+/);
  return {
    ...u,
    name: parts[0],
    initials: (parts[0][0] + (parts.length > 1 ? parts.at(-1)[0] : '')).toUpperCase(),
  };
};

export function BudgetProvider({ children }) {
  const [user, setUserState] = useState(null);
  const [budget, setBudget] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const logout = useCallback(() => {
    setToken(null);
    setUserState(null);
    setBudget(null);
    setExpenses([]);
    setGoals([]);
  }, []);

  const loadAll = useCallback(async () => {
    const [me, b, ex, g] = await Promise.all([api.me(), api.getBudget(), api.getExpenses(), api.getGoals()]);
    setUserState(decorateUser(me));
    setBudget(b);
    setExpenses(ex);
    setGoals(g);
  }, []);

  // Restore session on page load
  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!getToken()) return;
    loadAll()
      .catch(logout)
      .finally(() => setLoading(false));
  }, [loadAll, logout]);

  const summary = useMemo(
    () => (budget ? { ...getBudgetSummary(budget, expenses), type: budget.type } : null),
    [budget, expenses]
  );

  /* ---------- Auth ---------- */
  const signIn = async (email, password) => {
    const res = await api.login(email, password);
    setToken(res.token);
    setLoading(true);
    try {
      await loadAll();
    } finally {
      setLoading(false);
    }
    return decorateUser(res.user);
  };

  const signUp = async (fullName, email, password) => {
    const res = await api.register(fullName, email, password);
    setToken(res.token);
    await loadAll();
    return decorateUser(res.user);
  };

  const updateProfile = async (data) => {
    const me = await api.updateMe(data);
    setUserState(decorateUser(me));
  };

  /* ---------- Data ---------- */
  const refreshExpenses = async () => setExpenses(await api.getExpenses());

  const addExpense = async (expense) => {
    const created = await api.addExpense(expense);
    setExpenses((prev) => [...prev, created]);
    return created;
  };

  const deleteExpense = async (id) => {
    await api.deleteExpense(id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  const startNewBudget = async (data) => {
    const b = await api.createBudget(data);
    setBudget(b);
    await refreshExpenses();
  };

  const addGoal = async (goal) => {
    const g = await api.addGoal(goal);
    setGoals((prev) => [...prev, g]);
  };

  const addToGoal = async (id, amount) => {
    const g = await api.depositGoal(id, amount);
    setGoals((prev) => prev.map((x) => (x.id === id ? g : x)));
  };

  /** Sends a chat message; the AI may add/remove expenses, so we refresh them after. */
  const sendChat = async (message) => {
    const res = await api.chat(message);
    if (res.toolCalls.some((t) => ['add_expense', 'undo_last_expense'].includes(t.name))) {
      await refreshExpenses();
    }
    return res;
  };

  const value = {
    user,
    loading,
    signIn,
    signUp,
    logout,
    updateProfile,
    budget,
    expenses,
    addExpense,
    deleteExpense,
    startNewBudget,
    goals,
    addGoal,
    addToGoal,
    summary,
    sendChat,
  };

  return <BudgetContext.Provider value={value}>{children}</BudgetContext.Provider>;
}

export function useBudget() {
  const ctx = useContext(BudgetContext);
  if (!ctx) throw new Error('useBudget must be used inside <BudgetProvider>');
  return ctx;
}

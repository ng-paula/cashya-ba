/* ==========================================================
   API client — every call to the FastAPI backend goes through here.
   In dev, Vite forwards /api to http://localhost:8000 (vite.config.js).
   In Docker, nginx forwards /api to the backend container.
   ========================================================== */

const TOKEN_KEY = 'cashya_token';

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (token) => {
  try {
    token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked — session lasts until reload */
  }
};

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => (onUnauthorized = fn);

async function request(method, path, body, { isForm = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Is the backend running on port 8000?');
  }

  if (res.status === 401 && token) onUnauthorized();
  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = data?.detail;
    const message = Array.isArray(detail) ? detail.map((d) => d.msg).join(', ') : detail || `Request failed (${res.status})`;
    throw new ApiError(res.status, message);
  }
  return data;
}

export const api = {
  // Auth
  login: (email, password) => request('POST', '/auth/login', { email, password }),
  register: (fullName, email, password) => request('POST', '/auth/register', { fullName, email, password }),
  me: () => request('GET', '/auth/me'),
  updateMe: (data) => request('PATCH', '/auth/me', data),
  changePassword: (currentPassword, newPassword) => request('POST', '/auth/password', { currentPassword, newPassword }),

  // Budget & expenses
  getBudget: () => request('GET', '/budget'),
  createBudget: (data) => request('POST', '/budget', data),
  getExpenses: () => request('GET', '/expenses'),
  addExpense: (data) => request('POST', '/expenses', data),
  deleteExpense: (id) => request('DELETE', `/expenses/${id}`),

  // Goals
  getGoals: () => request('GET', '/goals'),
  addGoal: (data) => request('POST', '/goals', data),
  depositGoal: (id, amount) => request('POST', `/goals/${id}/deposit`, { amount }),

  // Chat (AI)
  chat: (message) => request('POST', '/chat', { message }),
  chatHistory: () => request('GET', '/chat/history'),
  clearChat: () => request('DELETE', '/chat/history'),

  // Household (parent)
  getChildren: () => request('GET', '/household'),
  linkChild: (childEmail) => request('POST', '/household/link', { childEmail }),

  // Automation
  testAlert: () => request('POST', '/automation/test'),
  getNotifications: () => request('GET', '/notifications'),
  markNotificationRead: (id) => request('POST', `/notifications/${id}/read`),
  markAllNotificationsRead: () => request('POST', '/notifications/read-all'),

  // Admin
  adminMetrics: () => request('GET', '/admin/metrics'),
  adminDocs: () => request('GET', '/admin/kb'),
  adminUpload: (file) => {
    const form = new FormData();
    form.append('file', file);
    return request('POST', '/admin/kb', form, { isForm: true });
  },
  adminDeleteDoc: (id) => request('DELETE', `/admin/kb/${id}`),
  adminSearch: (q) => request('GET', `/admin/kb/search?q=${encodeURIComponent(q)}`),
  adminGuardrails: () => request('GET', '/admin/guardrails'),
  adminAutomation: () => request('GET', '/admin/automation'),
  adminUsers: () => request('GET', '/admin/users'),
  adminSetRole: (id, role) => request('PATCH', `/admin/users/${id}/role`, { role }),
};

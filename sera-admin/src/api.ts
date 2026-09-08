import { AdminOverview, UserSummary, UserDetail, GlobalTrigger, AdminUser } from './types';

// In local development Vite proxies /api -> http://localhost:3001
// In production Vercel/Cloud Run, VITE_API_URL points to https://api.seraos.xyz
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

const STORAGE_TOKEN_KEY = 'sera_admin_token';
const STORAGE_KEY_KEY = 'sera_admin_key';
const STORAGE_USER_KEY = 'sera_admin_user';

export function getStoredAuth(): { token: string | null; adminKey: string | null; user: AdminUser | null } {
  const token = localStorage.getItem(STORAGE_TOKEN_KEY);
  const adminKey = localStorage.getItem(STORAGE_KEY_KEY);
  const userJson = localStorage.getItem(STORAGE_USER_KEY);
  let user: AdminUser | null = null;
  if (userJson) {
    try {
      user = JSON.parse(userJson);
    } catch {
      user = null;
    }
  }
  return { token, adminKey, user };
}

export function setStoredAuth(data: { token?: string; adminKey?: string; user?: AdminUser }): void {
  if (data.token) localStorage.setItem(STORAGE_TOKEN_KEY, data.token);
  if (data.adminKey) localStorage.setItem(STORAGE_KEY_KEY, data.adminKey);
  if (data.user) localStorage.setItem(STORAGE_USER_KEY, JSON.stringify(data.user));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(STORAGE_TOKEN_KEY);
  localStorage.removeItem(STORAGE_KEY_KEY);
  localStorage.removeItem(STORAGE_USER_KEY);
}

function getAuthHeaders(): Record<string, string> {
  const { token, adminKey } = getStoredAuth();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (adminKey) {
    headers['x-admin-key'] = adminKey;
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

export async function loginAdmin(credentials: {
  email?: string;
  password?: string;
  adminKey?: string;
}): Promise<{ token: string; adminKey?: string; user: AdminUser }> {
  const res = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials)
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || data.error || 'Authentication failed');
  }

  const result = {
    token: data.token,
    adminKey: data.adminKey || (credentials.adminKey ? credentials.adminKey : undefined),
    user: data.user
  };

  setStoredAuth(result);
  return result;
}

export async function fetchOverview(): Promise<AdminOverview> {
  const res = await fetch(`${API_BASE}/api/admin/overview`, {
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStoredAuth();
      throw new Error('UNAUTHORIZED');
    }
    throw new Error(data.message || data.error || 'Failed to fetch overview');
  }
  return data.data;
}

export async function fetchUsers(): Promise<UserSummary[]> {
  const res = await fetch(`${API_BASE}/api/admin/users`, {
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) {
    if (res.status === 401) {
      clearStoredAuth();
      throw new Error('UNAUTHORIZED');
    }
    throw new Error(data.message || data.error || 'Failed to fetch users');
  }
  return data.users || [];
}

export async function fetchUserDetail(sessionId: string): Promise<UserDetail> {
  const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(sessionId)}`, {
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch user details');
  }
  return data.user;
}

export async function adjustUserCredits(sessionId: string, amount: number): Promise<number> {
  const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(sessionId)}/credits`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ amount })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to adjust credits');
  }
  return data.agentCredits;
}

export async function forceDisconnectIntegration(sessionId: string, provider: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(sessionId)}/disconnect`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ provider })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to disconnect integration');
  }
}

export async function cancelUserTrigger(sessionId: string, triggerId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(sessionId)}/triggers/${encodeURIComponent(triggerId)}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to cancel trigger');
  }
}

export async function fetchGlobalTriggers(): Promise<GlobalTrigger[]> {
  const res = await fetch(`${API_BASE}/api/admin/triggers`, {
    headers: getAuthHeaders()
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || 'Failed to fetch global triggers');
  }
  return data.triggers || [];
}

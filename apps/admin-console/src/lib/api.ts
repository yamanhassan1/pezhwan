import type { Envelope } from '../types';

const base = (import.meta.env.VITE_API_URL as string) ?? '';

export type { Envelope };

export class ApiError extends Error {
  code: string;
  detail?: unknown;
  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.detail = detail;
  }
}

let _csrfToken = '';
let _accessToken = '';

export function setAccessToken(token: string) {
  _accessToken = token;
  if (token) {
    localStorage.setItem('pz_admin_token', token);
  } else {
    localStorage.removeItem('pz_admin_token');
  }
}

export function getAccessToken(): string {
  if (_accessToken) return _accessToken;
  const stored = localStorage.getItem('pz_admin_token');
  if (stored) {
    _accessToken = stored;
    return stored;
  }
  return '';
}

export function clearAuth() {
  _accessToken = '';
  _csrfToken = '';
  localStorage.removeItem('pz_admin_token');
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts?: { skipAuth?: boolean },
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  const token = getAccessToken();
  if (token && !opts?.skipAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (_csrfToken) {
    headers['X-CSRF-Token'] = _csrfToken;
  }

  const res = await fetch(base + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });

  if (res.status === 401 && !opts?.skipAuth) {
    clearAuth();
    if (!path.startsWith('/v1/auth')) {
      window.location.href = '/login';
    }
    throw new ApiError('UNAUTHORIZED', 'Session expired');
  }

  const json = (await res.json()) as Envelope<T>;
  if (!json.success) {
    const err = json.error ?? { code: 'UNKNOWN', message: 'Request failed' };
    throw new ApiError(err.code, err.message, err.detail);
  }
  return json.data;
}

export async function getCsrf(): Promise<string> {
  const res = await fetch(base + '/v1/auth/csrf', { credentials: 'include' });
  const json = (await res.json()) as Envelope<{ csrfToken: string }>;
  if (!json.success || !json.data?.csrfToken) {
    throw new ApiError('CSRF', 'Failed to obtain CSRF token');
  }
  _csrfToken = json.data.csrfToken;
  return _csrfToken;
}

export async function login(
  email: string,
  password: string,
): Promise<{
  mfaRequired: boolean;
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
}> {
  return request('POST', '/v1/auth/login', { email, password }, { skipAuth: true });
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>('GET', path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('POST', path, body);
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>('PATCH', path, body);
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>('DELETE', path);
}

export function currentUser() {
  return apiGet<{
    id: string;
    tenantId: string;
    applicationId: string;
    email: string;
    phone: string;
    emailVerified: boolean;
    isActive: boolean;
    roles: string[];
  }>('/v1/users/me');
}

import type { ApiEnvelope } from '../types';

const base: string =
  (import.meta as unknown as { env: Record<string, string | undefined> }).env?.VITE_API_URL ?? '';

let accessToken: string | null = null;
let csrfToken: string | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }
  if (csrfToken && method !== 'GET' && method !== 'HEAD') {
    headers['X-CSRF-Token'] = csrfToken;
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
    credentials: 'include',
  });
  if (res.status === 401) {
    accessToken = null;
    localStorage.removeItem('dp_access_token');
    window.location.hash = '';
    window.location.href = '/login';
    throw new ApiError('Unauthorized', 'UNAUTHORIZED', 401);
  }
  const json: ApiEnvelope<T> = await res.json();
  if (!json.success) {
    throw new ApiError(
      json.error?.message ?? 'Unknown error',
      json.error?.code ?? 'UNKNOWN',
      res.status,
    );
  }
  return json.data;
}

export async function getCsrf(): Promise<string> {
  const res = await fetch(`${base}/v1/auth/csrf`, { credentials: 'include' });
  const json: ApiEnvelope<{ csrfToken: string }> = await res.json();
  if (!json.success || !json.data?.csrfToken) {
    throw new ApiError(
      json.error?.message ?? 'CSRF fetch failed',
      json.error?.code ?? 'CSRF_FAILED',
      res.status,
    );
  }
  csrfToken = json.data.csrfToken;
  return csrfToken;
}

export async function login(
  email: string,
  password: string,
): Promise<{
  mfaRequired: boolean;
  tokens: { accessToken: string; refreshToken: string; expiresIn: number };
  user?: import('../types').User;
}> {
  return request('POST', '/v1/auth/login', { email, password });
}

export async function currentUser(): Promise<import('../types').User> {
  return request('GET', '/v1/users/me');
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

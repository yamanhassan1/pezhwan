/**
 * PEZHWAN — Vue 3 auth composable.
 *
 * Shared singleton auth state (`user`, `status`, `error`) with login/register/
 * logout/refresh actions backed by the PEZHWAN REST API. Mirrors the React SDK
 * surface so both framework packages behave identically.
 */

import { computed, readonly, ref, type ComputedRef, type Ref, type InjectionKey } from 'vue';
import { getActiveConfig } from '../plugin';

export interface PezhwanConfig {
  baseUrl: string;
}

export const PEZHWAN_CONFIG: InjectionKey<PezhwanConfig> = Symbol('pezhwan.config');

export interface PezhwanUser {
  id: string;
  tenantId?: string;
  applicationId?: string;
  email?: string;
  phone?: string;
  emailVerified?: boolean;
  isActive?: boolean;
  roles?: string[];
}

export type AuthStatus = 'loading' | 'guest' | 'authenticated';

export interface AuthState {
  user: PezhwanUser | null;
  status: AuthStatus;
  error: string | null;
}

const STORAGE_KEY = 'pezhwan.session';

function readCachedSession(): PezhwanUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PezhwanUser;
    return parsed?.id ? parsed : null;
  } catch {
    return null;
  }
}

function persistSession(user: PezhwanUser | null): void {
  try {
    if (!user) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } catch {
    /* storage unavailable */
  }
}

export async function request(
  config: PezhwanConfig,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    const err = new Error(body.error?.message ?? 'Request failed') as Error & {
      code?: string;
      status?: number;
    };
    err.code = body.error?.code;
    err.status = res.status;
    throw err;
  }
  return body.data;
}

const state = ref<AuthState>({
  user: readCachedSession(),
  status: 'loading',
  error: null,
}) as Ref<AuthState>;

const isAuthenticated = computed(() => state.value.status === 'authenticated');
const isLoading = computed(() => state.value.status === 'loading');

async function bootstrap(): Promise<void> {
  const cached = readCachedSession();
  if (!cached) {
    state.value.status = 'guest';
    state.value.user = null;
    return;
  }
  try {
    const profile = (await request(getActiveConfig(), '/v1/users/me')) as PezhwanUser;
    state.value = { user: profile, status: 'authenticated', error: null };
    persistSession(profile);
  } catch {
    state.value.status = 'guest';
    state.value.user = null;
    persistSession(null);
  }
}

async function login(input: { email?: string; phone?: string; password: string }): Promise<void> {
  state.value.status = 'loading';
  state.value.error = null;
  try {
    const data = (await request(getActiveConfig(), '/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify(input),
    })) as { user?: PezhwanUser };
    const user = data.user ?? null;
    state.value = { user, status: user ? 'authenticated' : 'guest', error: null };
    persistSession(user);
  } catch (err) {
    state.value.error = err instanceof Error ? err.message : String(err);
    state.value.status = 'guest';
    throw err;
  }
}

async function register(input: {
  email?: string;
  phone?: string;
  password?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  state.value.status = 'loading';
  state.value.error = null;
  try {
    const data = (await request(getActiveConfig(), '/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })) as { user?: PezhwanUser };
    const user = data.user ?? null;
    state.value = { user, status: user ? 'authenticated' : 'guest', error: null };
    persistSession(user);
  } catch (err) {
    state.value.error = err instanceof Error ? err.message : String(err);
    state.value.status = 'guest';
    throw err;
  }
}

async function logout(): Promise<void> {
  try {
    await request(getActiveConfig(), '/v1/auth/logout', { method: 'POST' });
  } catch {
    /* best-effort */
  }
  persistSession(null);
  state.value = { user: null, status: 'guest', error: null };
}

/** Vue composable exposing the shared authentication state and actions. */
export function useAuth(): {
  state: Readonly<Ref<AuthState>>;
  isAuthenticated: ComputedRef<boolean>;
  isLoading: ComputedRef<boolean>;
  login: typeof login;
  register: typeof register;
  logout: typeof logout;
  refreshProfile: () => Promise<void>;
} {
  return {
    state: readonly(state) as Readonly<Ref<AuthState>>,
    isAuthenticated,
    isLoading,
    login,
    register,
    logout,
    refreshProfile: async () => {
      const profile = (await request(getActiveConfig(), '/v1/users/me')) as PezhwanUser;
      state.value = { user: profile, status: 'authenticated', error: null };
      persistSession(profile);
    },
  };
}

export function bootstrapAuth(): Promise<void> {
  return bootstrap();
}
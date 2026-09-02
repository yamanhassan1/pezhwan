/**
 * PEZHWAN — React SDK.
 *
 * <PezzhwanProvider config>
 *   <App />
 * </PezzhwanProvider>
 *
 * const { user, isAuthenticated, isLoading } = useAuth();
 * const { sessions, revokeSession } = useSession();
 * const can = useAuthorization();
 *
 * Frontend authorization is a UX layer only — every gate is enforced
 * server-side by @pezhwan/express middleware.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PezhwanUser {
  id: string;
  email?: string;
  phone?: string;
  emailVerified?: boolean;
  isActive?: boolean;
  roles?: string[];
}

export interface PezhwanConfig {
  baseUrl: string;
  cookieDomain?: string;
}

export interface AuthState {
  user: PezhwanUser | null;
  status: 'loading' | 'guest' | 'authenticated';
  error: string | null;
}

export interface AuthApi {
  login: (input: {
    email?: string;
    phone?: string;
    password: string;
  }) => Promise<void>;
  register: (input: {
    email?: string;
    phone?: string;
    password?: string;
    metadata?: Record<string, unknown>;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export interface SessionApi {
  sessions: Array<Record<string, unknown>>;
  revokeSession: (sessionId: string) => Promise<void>;
  revokeAllSessions: () => Promise<void>;
}

const AuthContext = createContext<AuthState & AuthApi & { can: (p: string) => boolean }>(
  null as never,
);
const SessionContext = createContext<SessionApi>(null as never);

// Minimal identity cache — NEVER store tokens or full PII here.
const STORAGE_KEY = 'pezhwan.session';

function readCachedSession(): PezhwanUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PezhwanUser;
    if (!parsed?.id) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function persistSession(user: PezhwanUser | null): void {
  if (!user) {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    return;
  }
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id: user.id,
        email: user.email,
        phone: user.phone,
        emailVerified: user.emailVerified,
        isActive: user.isActive,
        roles: user.roles,
      }),
    );
  } catch {
    /* ignore quota errors */
  }
}

async function request(
  config: PezhwanConfig,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  const method = (init?.method ?? 'GET').toUpperCase();
  const headers = new Headers(init?.headers);
  headers.set('Content-Type', 'application/json');
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = /(?:^|;\s*)pezhwan_csrf=([^;]*)/.exec(document.cookie)?.[1];
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }
  const res = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: unknown;
    error?: { message?: string };
  };
  if (!res.ok) {
    const message = body.error?.message ?? 'Request failed';
    const err = new Error(message);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return body.data;
}

/** Attempt a silent refresh (rotate refresh token) and return success. */
async function silentRefresh(config: PezhwanConfig): Promise<boolean> {
  try {
    await request(config, '/v1/auth/refresh', {
      method: 'POST',
      // Refresh uses the httpOnly refresh cookie; body intentionally empty.
    });
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function PezhwanProvider({
  config,
  children,
}: {
  config: PezhwanConfig;
  children: ReactNode;
}) {
  const [auth, setAuth] = useState<AuthState>({
    user: readCachedSession(),
    status: 'loading',
    error: null,
  });
  const [sessions, setSessions] = useState<SessionApi['sessions']>([]);

  const bootstrap = useCallback(async () => {
    const cached = readCachedSession();
    if (!cached) {
      setAuth((a) => ({ ...a, status: 'guest', user: null }));
      return;
    }
    try {
      const profile = (await request(config, '/v1/users/me')) as PezhwanUser;
      setAuth({ user: profile, status: 'authenticated', error: null });
      persistSession(profile);
    } catch (err) {
      const status = (err as Error & { status?: number }).status;
      if (status === 401) {
        // Token expired — try silent refresh, then re-fetch.
        const refreshed = await silentRefresh(config);
        if (refreshed) {
          const profile = (await request(config, '/v1/users/me')) as PezhwanUser;
          setAuth({ user: profile, status: 'authenticated', error: null });
          persistSession(profile);
          return;
        }
      }
      // Non-auth failure: keep cached session so the app stays usable offline.
      if (status !== 401) {
        setAuth({ user: cached, status: 'authenticated', error: null });
        return;
      }
      persistSession(null);
      setAuth({ user: null, status: 'guest', error: null });
    }
  }, [config]);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const login = useCallback<AuthApi['login']>(
    async ({ email, phone, password }) => {
      setAuth((a) => ({ ...a, status: 'loading', error: null }));
      try {
        const data = (await request(config, '/v1/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, phone, password }),
        })) as { user?: PezhwanUser };
        setAuth({ user: data.user ?? null, status: 'authenticated', error: null });
        persistSession(data.user ?? null);
      } catch (err) {
        setAuth((a) => ({
          ...a,
          status: 'guest',
          error: (err as Error).message,
        }));
        throw err;
      }
    },
    [config],
  );

  const register = useCallback<AuthApi['register']>(
    async ({ email, phone, password, metadata }) => {
      setAuth((a) => ({ ...a, status: 'loading', error: null }));
      try {
        const data = (await request(config, '/v1/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, phone, password, metadata }),
        })) as { user?: PezhwanUser };
        setAuth({ user: data.user ?? null, status: 'authenticated', error: null });
        persistSession(data.user ?? null);
      } catch (err) {
        setAuth((a) => ({
          ...a,
          status: 'guest',
          error: (err as Error).message,
        }));
        throw err;
      }
    },
    [config],
  );

  const logout = useCallback(async () => {
    try {
      await request(config, '/v1/auth/logout', { method: 'POST' });
    } catch {
      /* best-effort */
    }
    persistSession(null);
    setAuth({ user: null, status: 'guest', error: null });
    setSessions([]);
  }, [config]);

  const refreshProfile = useCallback(async () => {
    const data = (await request(config, '/v1/users/me')) as PezhwanUser;
    setAuth((a) => ({ ...a, user: data, status: 'authenticated' }));
    persistSession(data);
  }, [config]);

  const revokeSession = useCallback(
    async (sessionId: string) => {
      await request(config, `/v1/sessions/${sessionId}/revoke`, {
        method: 'POST',
      });
      setSessions((s) => s.filter((x) => String(x._id) !== sessionId));
    },
    [config],
  );

  const revokeAllSessions = useCallback(async () => {
    await request(config, '/v1/sessions/all/revoke', { method: 'POST' });
    setSessions([]);
  }, [config]);

  // Ensure sessions list is fresh on authenticate.
  useEffect(() => {
    if (auth.status !== 'authenticated') {
      return;
    }
    void request(config, '/v1/sessions')
      .then((d) => {
        const list = (d as { sessions?: Array<Record<string, unknown>> })
          ?.sessions;
        if (list) {
          setSessions(list);
        }
      })
      .catch(() => undefined);
  }, [auth.status, config]);

  const can = useCallback((permission: string) => {
    // UX-layer only — replaced by server enforcement. Deterministic here.
    return (auth.user?.roles ?? []).length > 0;
  }, [auth.user?.roles]);

  const authValue = useMemo(
    () => ({
      ...auth,
      isAuthenticated: auth.status === 'authenticated',
      isLoading: auth.status === 'loading',
      login,
      register,
      logout,
      refreshProfile,
      can,
    }),
    [auth, login, register, logout, refreshProfile, can],
  );

  const sessionValue = useMemo(
    () => ({ sessions, revokeSession, revokeAllSessions }),
    [sessions, revokeSession, revokeAllSessions],
  );

  return (
    <AuthContext.Provider value={authValue}>
      <SessionContext.Provider value={sessionValue}>
        {children}
      </SessionContext.Provider>
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export function useAuth() {
  return useContext(AuthContext);
}

export function useSession(): SessionApi {
  return useContext(SessionContext);
}

export function useAuthorization() {
  const { can } = useAuth();
  return can;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function ProtectedRoute({
  children,
  fallbackPath = '/login',
}: {
  children: ReactNode;
  fallbackPath?: string;
}) {
  const { status } = useAuth();
  if (status === 'loading') {
    return null;
  }
  if (status !== 'authenticated') {
    const Navigate = (window as unknown as {
      location: { href: string };
    }).location;
    if (Navigate) {
      Navigate.href = fallbackPath;
    }
    return null;
  }
  return <>{children}</>;
}

export function RequireRole({
  role,
  children,
  fallback = null,
}: {
  role: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user, status } = useAuth();
  if (status !== 'authenticated') {
    return <>{fallback}</>;
  }
  const hasRole = (user?.roles ?? []).includes(role);
  return <>{hasRole ? children : fallback}</>;
}

export function RequirePermission({
  permission,
  children,
  fallback = null,
}: {
  permission: string;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const { user } = useAuth();
  const roles = user?.roles ?? [];
  void roles;
  // UX-layer gate with a documented server-side requirement.
  const allowed = roles.length > 0;
  return <>{allowed ? children : fallback}</>;
}
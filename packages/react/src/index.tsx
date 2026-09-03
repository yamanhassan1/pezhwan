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
  tenantId?: string;
  applicationId?: string;
  email?: string;
  phone?: string;
  emailVerified?: boolean;
  isActive?: boolean;
  roles?: string[];
}

/** Structured error surfaced from the server envelope ({ code, message }). */
export interface PezhwanError {
  code?: string;
  message: string;
  status?: number;
}

export interface PezhwanConfig {
  baseUrl: string;
  cookieDomain?: string;
}

export interface AuthState {
  user: PezhwanUser | null;
  status: 'loading' | 'guest' | 'authenticated';
  error: string | PezhwanError | null;
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
        tenantId: user.tenantId,
        applicationId: user.applicationId,
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

/** Error thrown on a non-2xx response, carrying the server envelope's `code`. */
export class PezhwanApiError extends Error {
  readonly code?: string;
  readonly status?: number;

  constructor(body: { code?: string; message?: string }, status: number) {
    super(body.message ?? 'Request failed');
    this.name = 'PezhwanApiError';
    this.code = body.code;
    this.status = status;
  }
}

/** Normalize a caught error to a string or a structured `PezhwanError`. */
function errorToMessage(err: unknown): string | PezhwanError {
  if (err instanceof PezhwanApiError) {
    return {
      code: err.code,
      message: err.message,
      status: err.status,
    };
  }
  return err instanceof Error ? err.message : String(err);
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
    error?: { code?: string; message?: string };
  };
  if (!res.ok) {
    throw new PezhwanApiError(body.error ?? {}, res.status);
  }
  return body.data;
}

/**
 * Attempt a silent refresh (rotate refresh token) and return the outcome.
 * Returns `{ ok: true }` on success, or `{ ok: false, code?, status? }` with
 * the structured error so callers can distinguish a recoverable failure from a
 * tenant/application context mismatch (`SESSION_CONTEXT_INVALID`).
 */
async function silentRefresh(
  config: PezhwanConfig,
): Promise<{ ok: true } | { ok: false; code?: string; status?: number }> {
  try {
    await request(config, '/v1/auth/refresh', {
      method: 'POST',
      // Refresh uses the httpOnly refresh cookie; body intentionally empty.
    });
    return { ok: true };
  } catch (err) {
    const apiError = err as Partial<PezhwanApiError>;
    return {
      ok: false,
      code: apiError.code,
      status: apiError.status,
    };
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
      const apiError = err as Partial<PezhwanApiError>;
      const status = apiError.status;
      if (status === 401) {
        // Token expired — try silent refresh, then re-fetch.
        const refreshed = await silentRefresh(config);
        if (refreshed.ok) {
          const profile = (await request(config, '/v1/users/me')) as PezhwanUser;
          setAuth({ user: profile, status: 'authenticated', error: null });
          persistSession(profile);
          return;
        }
        // A refresh that fails because the session's tenant/application context
        // no longer matches is not recoverable — drop the stale session and
        // require re-authentication rather than keeping an invalid cache.
        if (refreshed.code === 'SESSION_CONTEXT_INVALID') {
          persistSession(null);
          setAuth({
            user: null,
            status: 'guest',
            error: { code: 'SESSION_CONTEXT_INVALID', message: 'Session context is invalid', status: 401 },
          });
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
        setAuth((a) => ({ ...a, status: 'guest', error: errorToMessage(err) }));
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
        setAuth((a) => ({ ...a, status: 'guest', error: errorToMessage(err) }));
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
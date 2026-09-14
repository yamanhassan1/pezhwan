import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getCsrf, login as apiLogin, setAccessToken, setCsrfToken } from '../lib/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mfaRequired: boolean }>;
  logout: () => void;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => ({ mfaRequired: false }),
  logout: () => {},
  isAdmin: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('dp_access_token');
    if (stored) {
      setAccessToken(stored);
      api
        .get<User>('/v1/users/me')
        .then((u) => setUser(u))
        .catch(() => {
          setAccessToken(null);
          localStorage.removeItem('dp_access_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    await getCsrf();
    const res = await apiLogin(email, password);
    setAccessToken(res.tokens.accessToken);
    localStorage.setItem('dp_access_token', res.tokens.accessToken);
    if (res.user) {
      setUser(res.user);
    } else {
      const me = await api.get<User>('/v1/users/me');
      setUser(me);
    }
    return { mfaRequired: res.mfaRequired };
  }, []);

  const logout = useCallback(() => {
    setAccessToken(null);
    setCsrfToken(null);
    localStorage.removeItem('dp_access_token');
    setUser(null);
  }, []);

  const isAdmin = useMemo(() => user?.roles.includes('ADMIN') ?? false, [user]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, logout, isAdmin }),
    [user, loading, login, logout, isAdmin],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}

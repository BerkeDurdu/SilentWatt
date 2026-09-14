import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Me } from '../shared/types';
import { api } from './api';
import { useI18n } from './i18n';

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { lang } = useI18n();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setMe(await api<Me>('/me'));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onExpired = () => setMe(null);
    window.addEventListener('sw:unauthorized', onExpired);
    return () => window.removeEventListener('sw:unauthorized', onExpired);
  }, [refresh]);

  // Screen titles, role label and scope note come from the server in the chosen language.
  const firstLang = useRef(true);
  useEffect(() => {
    if (firstLang.current) {
      firstLang.current = false;
      return;
    }
    void refresh();
  }, [lang, refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setMe(await api<Me>('/auth/login', { method: 'POST', body: { email, password } }));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      setMe(null);
    }
  }, []);

  const value = useMemo(() => ({ me, loading, login, logout, refresh }), [me, loading, login, logout, refresh]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Only for components rendered behind the login gate. */
export function useMe(): Me {
  const { me } = useAuth();
  if (!me) throw new Error('useMe called without a signed-in user');
  return me;
}

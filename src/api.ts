import { useCallback, useEffect, useState } from 'react';
import { getLang, useI18n } from './i18n';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

export async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'silentwatt', 'X-Lang': getLang() },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, 'network');
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (res.status === 401 && !path.startsWith('/auth/') && path !== '/me') {
    window.dispatchEvent(new Event('sw:unauthorized'));
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error');
  return data as T;
}

/** Fetches on mount, and again whenever the path or the interface language changes. */
export function useApi<T>(path: string) {
  const { lang } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    api<T>(path)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => alive && setError(e instanceof ApiError ? e : new ApiError(0, 'network')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [path, tick, lang]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, reload, setData };
}

import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError } from '../api';
import { useAuth } from '../auth';
import { Logo, Wordmark } from '../components/icons';
import { LangToggle } from '../components/ui';
import type { DictKey } from '../dict';
import { useI18n } from '../i18n';

const safeNext = (v: string | null) => (v && v.startsWith('/') && !v.startsWith('//') ? v : '/');

// Shown only by the Vite dev server, never in a production build.
const DEMO_ACCOUNTS: { email: string; role: DictKey }[] = [
  { email: 'emre@silentwatt.demo', role: 'role_technician' },
  { email: 'operator@silentwatt.demo', role: 'role_operator' },
  { email: 'yonetim@silentwatt.demo', role: 'role_manager' },
  { email: 'admin@silentwatt.demo', role: 'role_admin' },
];
const DEMO_PASSWORD = 'SilentWatt2026!';

export default function LoginPage() {
  const { me, loading, login } = useAuth();
  const { t } = useI18n();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<DictKey | null>(null);
  const [busy, setBusy] = useState(false);
  const next = safeNext(params.get('next'));

  if (!loading && me) return <Navigate to={next} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(next, { replace: true });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(status === 429 ? 'errTooMany' : status === 401 ? 'errInvalid' : 'errNetwork');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-brand">
        <div className="brand">
          <Logo size={40} />
          <span className="brand-text">
            <Wordmark />
            <small>{t('consoleName')}</small>
          </span>
        </div>
        <div className="login-thesis">
          <h1>{t('thesis1')}<br /><em>{t('thesis2')}</em></h1>
          <p>{t('thesisBody')}</p>
        </div>
        <TraceArt />
      </section>

      <section className="login-form-wrap">
        <div className="login-lang"><LangToggle /></div>
        <form className="login-card" onSubmit={submit} noValidate>
          <h2>{t('signInTitle')}</h2>
          <p className="muted">{t(next !== '/' ? 'signInToOpen' : 'signInLead')}</p>

          <label className="field">
            <span>{t('email')}</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </label>
          <label className="field">
            <span>{t('password')}</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>

          {error && <div className="form-error" role="alert">{t(error)}</div>}

          <button className="btn primary block" type="submit" disabled={busy || !email || !password}>
            {busy ? t('signingIn') : t('signInTitle')}
          </button>
          <p className="fine">{t('forgot')}</p>

          {import.meta.env.DEV && (
            <div className="demo">
              <span className="eyebrow">{t('demoAccounts')}</span>
              {DEMO_ACCOUNTS.map((a) => (
                <button
                  type="button"
                  key={a.email}
                  onClick={() => {
                    setEmail(a.email);
                    setPassword(DEMO_PASSWORD);
                  }}
                >
                  <span className="mono">{a.email}</span>
                  <span>{t(a.role)}</span>
                </button>
              ))}
            </div>
          )}
        </form>
      </section>
    </div>
  );
}

/** A household load running along its expected line, then stepping up: the silent loss the product finds. */
function TraceArt() {
  const { t } = useI18n();
  const pts = Array.from({ length: 40 }, (_, i) => {
    const x = 10 + i * 8.2;
    const y = 132 + Math.sin(i * 1.7) * 3 + Math.cos(i * 0.9) * 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <svg className="trace-art" viewBox="0 0 560 190" aria-hidden="true">
      <rect x="330" y="20" width="230" height="150" fill="var(--amber-soft)" />
      <line x1="0" x2="560" y1="132" y2="132" stroke="var(--line-2)" />
      <path d={`M${pts.join('L')}`} fill="none" stroke="var(--brand)" strokeWidth="3" strokeLinejoin="round" />
      <path d="M330 132 H470" fill="none" stroke="var(--brand)" strokeWidth="2" strokeDasharray="5 6" opacity=".7" />
      <path d="M330 132 V84 H550" fill="none" stroke="var(--amber)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
      <text x="478" y="150" className="t-muted">{t('artReference')}</text>
      <text x="344" y="72" className="t-amber">{t('artLoss')} +14%</text>
    </svg>
  );
}

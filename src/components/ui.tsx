import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { CaseStatus, Priority as PriorityLevel } from '../../shared/types';
import type { ApiError } from '../api';
import { useI18n } from '../i18n';

export function StatusPill({ status }: { status: CaseStatus }) {
  const { t } = useI18n();
  return <span className={`pill st-${status}`}>{t(`status_${status}`)}</span>;
}

/** A small step: the taller it is, the higher the priority. */
export function StepGlyph({ priority }: { priority: PriorityLevel }) {
  const h = priority === 3 ? 10 : priority === 2 ? 5 : 0;
  const color = priority === 1 ? 'var(--line-2)' : 'var(--amber)';
  return (
    <svg width="30" height="16" viewBox="0 0 30 16" aria-hidden="true">
      <path d={`M2 13H15V${13 - h}H28`} fill="none" stroke={color} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Priority({ priority }: { priority: PriorityLevel }) {
  const { t } = useI18n();
  return (
    <span className="prio">
      <StepGlyph priority={priority} />
      <span>{t(`priority_${priority}`)}</span>
    </span>
  );
}

export function PageHead({ title, lead, actions }: { title: ReactNode; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="loading" role="status">
      <span className="loading-bar" />
      {label ?? t('loading')}
    </div>
  );
}

/**
 * Any address this account can't open — a screen it doesn't have, another technician's case, a typo —
 * quietly lands on the user's home screen. Same outcome whether the page exists or not.
 */
export function GoHome() {
  return <Navigate to="/" replace />;
}

export function LoadError({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const { t } = useI18n();
  if (error.status === 404) return <GoHome />;
  return (
    <div className="panel panel-b load-error">
      <p>{t(error.status === 0 ? 'loadErrorNetwork' : 'loadErrorData')} {t('loadErrorHint')}</p>
      <button className="btn" onClick={onRetry}>{t('retry')}</button>
    </div>
  );
}

export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div className="lang" role="group" aria-label={t('language')}>
      {(['tr', 'en'] as const).map((l) => (
        <button key={l} lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

import { Link } from 'react-router-dom';
import type { TeamMember } from '../../shared/types';
import { useApi } from '../api';
import { LoadError, Loading, PageHead, StatusPill, StepGlyph } from '../components/ui';
import { pct } from '../format';
import { useI18n } from '../i18n';

export default function Team() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi<TeamMember[]>('/team');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  return (
    <>
      <PageHead title={t('teamTitle')} lead={t('teamLead')} />
      <div className="team">
        {data.map((m) => (
          <section className="panel member" key={m.id}>
            <div className="member-head">
              <span className="avatar">{m.initials}</span>
              <h2>{m.name}</h2>
            </div>
            <dl className="member-stats">
              <div><dt>{t('openJobs')}</dt><dd>{m.openJobs}</dd></div>
              <div><dt>{t('closedJobs')}</dt><dd>{m.closed}</dd></div>
              <div><dt>{t('confirmRate')}</dt><dd>{m.findingRate === null ? '—' : pct(m.findingRate)}</dd></div>
            </dl>
            {m.jobs.length === 0 ? (
              <p className="panel-b muted">{t('noJobs')}</p>
            ) : (
              <ul className="member-jobs">
                {m.jobs.map((j) => (
                  <li key={j.id}>
                    <StepGlyph priority={j.priority} />
                    <div>
                      {j.href ? <Link to={j.href} className="mono">{j.id}</Link> : <span className="mono">{j.id}</span>}
                      <span className="sub">{j.title} · {j.household}</span>
                    </div>
                    <StatusPill status={j.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </>
  );
}

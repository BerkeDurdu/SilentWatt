import { Link, Route, Routes } from 'react-router-dom';
import type { JobsData } from '../../shared/types';
import { useApi } from '../api';
import { useMe } from '../auth';
import { CaseDetailView } from '../components/CaseDetailView';
import { Icon } from '../components/icons';
import { GoHome, LoadError, Loading, PageHead, StatusPill, StepGlyph } from '../components/ui';
import { dateTime } from '../format';
import { useI18n } from '../i18n';

export default function Jobs() {
  return (
    <Routes>
      <Route index element={<JobList />} />
      <Route path=":caseId" element={<CaseDetailView backLabel="backJobs" />} />
      <Route path="*" element={<GoHome />} />
    </Routes>
  );
}

function JobList() {
  const me = useMe();
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi<JobsData>('/jobs');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  return (
    <>
      <PageHead
        title={t('hello', { name: me.name.split(' ')[0] })}
        lead={data.jobs.length ? t('jobsLead', { n: data.jobs.length }) : t('jobsNone')}
      />
      <div className="jobs-layout">
        <div className="jobs">
          {data.jobs.map((job) => (
            <article className="job" key={job.id}>
              <div className="job-top">
                <span className="case-id">{job.id}</span>
                <StatusPill status={job.status} />
                <span className="job-prio"><StepGlyph priority={job.priority} /></span>
              </div>
              <h2>{job.topCause.label}</h2>
              <p className="addr">{job.location}</p>
              <div className="job-check">
                <b>{t('firstCheck')}</b>
                {job.firstCheck}
              </div>
              {job.href && <Link className="btn primary" to={job.href}>{t('openCase')}</Link>}
            </article>
          ))}
        </div>

        {data.messages.length > 0 && (
          <aside className="inbox" aria-label={t('inboxAria')}>
            <h2 className="eyebrow">{t('inbox')}</h2>
            {data.messages.map((m) => (
              <div className="sms" key={m.id}>
                <div className="sms-head"><span>SilentWatt</span><span className="mono">{dateTime(m.at)}</span></div>
                <div className={m.caseOpen ? 'bubble' : 'bubble done'}>
                  {m.text}{' '}
                  {m.caseOpen ? <Link className="link mono" to={m.href}>{m.linkText}</Link> : <span className="mono muted">{m.linkText}</span>}
                </div>
                {!m.caseOpen && <span className="sms-closed"><Icon name="check" />{t('smsClosed')}</span>}
              </div>
            ))}
          </aside>
        )}
      </div>
    </>
  );
}

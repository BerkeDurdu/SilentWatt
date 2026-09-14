import type { DataSource, DataSourcesData } from '../../shared/types';
import { useApi } from '../api';
import { LoadError, Loading, PageHead } from '../components/ui';
import type { DictKey } from '../dict';
import { dateTime } from '../format';
import { useI18n } from '../i18n';

const STATUS: Record<DataSource['status'], [DictKey, string]> = {
  waiting: ['srcWaiting', 'st-new'],
  connected: ['srcConnected', 'st-verified'],
  example: ['srcExample', 'st-verified'],
  none: ['srcNone', 'st-dismissed'],
};

export default function DataSources() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi<DataSourcesData>('/data-sources');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  return (
    <>
      <PageHead title={t('dataTitle')} lead={t('dataLead')} />
      <section className="panel sources">
        {data.sources.map((s) => (
          <div className="src" key={s.id}>
            <div>
              <h2>{s.name}</h2>
              <p>{s.description}</p>
            </div>
            <div className="src-last">
              <span className="muted">{t('lastData')}</span>
              <span className="mono">{s.lastData ? dateTime(s.lastData) : '—'}</span>
            </div>
            <span className={`pill ${STATUS[s.status][1]}`}>{t(STATUS[s.status][0])}</span>
          </div>
        ))}
      </section>
    </>
  );
}

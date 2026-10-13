import type { DataSourcesData } from '../../shared/types';
import { useApi } from '../api';
import { Icon } from '../components/icons';
import { LoadError, Loading, PageHead } from '../components/ui';
import { dateTime } from '../format';
import { useI18n } from '../i18n';

export default function DataSources() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi<DataSourcesData>('/data-sources');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  return (
    <>
      <PageHead title={t('dataTitle')} lead={t('dataLead')} />
      {data.fixture && <p className="readonly note"><Icon name="eye" />{t('fixtureNote')}</p>}
      <div className="team">
        {data.groups.map((g) => (
          <section className="panel" key={g.title}>
            <div className="panel-h"><h2>{g.title}</h2></div>
            <div className="panel-b">
              <dl className="kv">
                {g.rows.map((r) => (
                  <div className="kv-row" key={r.label}><dt>{r.label}</dt><dd className="mono">{r.value}</dd></div>
                ))}
              </dl>
            </div>
          </section>
        ))}
      </div>
      <p className="footnote">{t('generatedAt')}: <span className="mono">{dateTime(data.generatedAt)}</span></p>
    </>
  );
}

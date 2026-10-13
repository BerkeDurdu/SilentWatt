import type { ReportData } from '../../shared/types';
import { useApi } from '../api';
import { Icon } from '../components/icons';
import { LoadError, Loading, PageHead } from '../components/ui';
import { signedShare } from '../format';
import { useI18n } from '../i18n';

export default function Reports() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useApi<ReportData>('/reports/monthly');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  return (
    <>
      <PageHead
        title={t('repTitle')}
        lead={t('repLead', { period: data.period })}
        actions={data.canExport && (
          <a className="btn" href={`/api/reports/monthly.csv?lang=${lang}`} download>
            <Icon name="download" />{t('csv')}
          </a>
        )}
      />
      <section className="panel">
        {data.rows.length === 0 ? (
          <p className="panel-b muted">{t('repEmpty')}</p>
        ) : (
          <div className="table-wrap">
            <table className="report">
              <thead>
                <tr>
                  <th>{t('thGroup')}</th>
                  <th className="r">{t('thCases')}</th>
                  <th className="r">{t('thOpen')}</th>
                  <th className="r">{t('thWithFinding')}</th>
                  <th className="r">{t('thNoFinding')}</th>
                  <th className="r">{t('thFlaggedDays')}</th>
                  <th className="r">{t('thMedianExcess')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.label} className={r.synthetic ? 'syn-row' : undefined}>
                    <td>{r.label}</td>
                    <td className="r mono">{r.cases}</td>
                    <td className="r mono">{r.synthetic ? '—' : r.open}</td>
                    <td className="r mono">{r.synthetic ? '—' : r.withFinding}</td>
                    <td className="r mono">{r.synthetic ? '—' : r.noFinding}</td>
                    <td className="r mono">{r.flaggedDays}</td>
                    <td className="r mono">{r.medianExcessShare === null ? '—' : signedShare(r.medianExcessShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="footnote">{t('repFoot')}</p>
    </>
  );
}

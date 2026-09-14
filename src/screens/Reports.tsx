import type { ReportData } from '../../shared/types';
import { useApi } from '../api';
import { Icon } from '../components/icons';
import { LoadError, Loading, PageHead } from '../components/ui';
import { num, pct } from '../format';
import { useI18n } from '../i18n';

export default function Reports() {
  const { t, lang } = useI18n();
  const { data, error, loading, reload } = useApi<ReportData>('/reports/monthly');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  const { rows, totals } = data;
  const lossMax = Math.max(...rows.map((r) => r.lossKwhMonth));

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
        <div className="table-wrap">
          <table className="report">
            <thead>
              <tr>
                <th>{t('thFamily')}</th>
                <th className="r">{t('thConfirmed')}</th>
                <th className="r">{t('thFalse')}</th>
                <th className="r">{t('thVisits')}</th>
                <th className="r">{t('thVpf')}</th>
                <th>{t('thLoss')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td>{r.label} {r.mvp0 && <span className="fam">MVP-0</span>}</td>
                  <td className="r mono">{r.confirmed}</td>
                  <td className="r mono">{r.falseAlarms} <span className="muted">({pct((r.falseAlarms / r.visits) * 100)})</span></td>
                  <td className="r mono">{r.visits}</td>
                  <td className="r mono">{num(r.visits / r.confirmed, 2)}</td>
                  <td>
                    <div className="loss">
                      <div className="track"><div className="fill" style={{ width: `${(r.lossKwhMonth / lossMax) * 100}%` }} /></div>
                      <span className="mono">{num(r.lossKwhMonth)}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td>{totals.label}</td>
                <td className="r mono">{totals.confirmed}</td>
                <td className="r mono">{totals.falseAlarms} <span className="muted">({pct((totals.falseAlarms / totals.visits) * 100)})</span></td>
                <td className="r mono">{totals.visits}</td>
                <td className="r mono">{num(totals.visits / totals.confirmed, 2)}</td>
                <td className="mono">{num(totals.lossKwhMonth)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
      <p className="footnote">{t('repFoot')}</p>
    </>
  );
}

import type { OverviewData } from '../../shared/types';
import { useApi } from '../api';
import { WeeklyChart } from '../components/charts';
import { LoadError, Loading, PageHead } from '../components/ui';
import { num, pct } from '../format';
import { useI18n } from '../i18n';

export default function Overview() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi<OverviewData>('/overview');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  const familyMax = Math.max(...data.families.map((f) => f.count));
  const confirmed = data.families.reduce((a, f) => a + f.count, 0);

  return (
    <>
      <PageHead title={t('ovTitle')} lead={t('ovLead')} />
      <div className="stack">
        <section className="panel kpis" aria-label={t('kpiAria')}>
          <div className="kpi hero-kpi">
            <span className="eyebrow">{t('kpiVisits')}</span>
            <span className="v">{num(data.visitsPerConfirmed, 2)}</span>
            <p>{t('kpiVisitsP')}</p>
          </div>
          <div className="kpi">
            <span className="eyebrow">{t('kpiFp')}</span>
            <span className="v">{pct(data.falseAlarmRate)}</span>
            <p>
              <span className={data.falseAlarmRate <= data.falseAlarmTarget ? 'delta good' : 'delta bad'}>{t('targetMax', { v: pct(data.falseAlarmTarget) })}</span>
              {' · '}{t('kpiFpP')}
            </p>
          </div>
          <div className="kpi">
            <span className="eyebrow">{t('kpiOpen')}</span>
            <span className="v">{data.openCases}</span>
            <p>{t('kpiOpenP')}</p>
          </div>
          <div className="kpi">
            <span className="eyebrow">{t('kpiCov')}</span>
            <span className="v">{pct(data.coverage, 1)}</span>
            <p>
              <span className="delta good">{t('targetEq', { v: pct(data.coverageTarget) })}</span>
              {' · '}{t('kpiCovP', { n: data.fieldResults })}
            </p>
          </div>
        </section>

        <div className="two wide">
          <section className="panel">
            <div className="panel-h"><h2>{t('weekly')}</h2><span className="aside">{t('weeklyAside')}</span></div>
            <div className="panel-b">
              <div className="legend">
                <span><i style={{ background: 'var(--brand)' }} />{t('lgConfirmed')}</span>
                <span><i style={{ background: 'var(--line-2)' }} />{t('lgFalse')}</span>
                <span><i style={{ background: 'var(--amber)' }} />{t('lgOpen')}</span>
              </div>
              <div className="chart-wrap"><WeeklyChart weeks={data.weeks} /></div>
            </div>
          </section>
          <section className="panel">
            <div className="panel-h"><h2>{t('families')}</h2><span className="aside mono">n = {confirmed}</span></div>
            <div className="panel-b bars">
              {data.families.map((f) => (
                <div className="bar-row" key={f.key}>
                  <span>{f.label} {f.mvp0 && <span className="fam">MVP-0</span>}</span>
                  <div className="track"><div className={f.mvp0 ? 'fill pv' : 'fill'} style={{ width: `${(f.count / familyMax) * 100}%` }} /></div>
                  <span className="n">{f.count}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="panel">
          <div className="panel-h"><h2>{t('regions')}</h2></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>{t('thRegion')}</th><th className="r">{t('thMeters')}</th><th className="r">{t('thOpen')}</th><th className="r">{t('thConfirmed')}</th><th className="r">{t('thFalse')}</th></tr>
              </thead>
              <tbody>
                {data.regions.map((r) => {
                  const rate = (r.dismissed / (r.verified + r.dismissed)) * 100;
                  return (
                    <tr key={r.name}>
                      <td>{r.name}</td>
                      <td className="r mono">{num(r.meters)}</td>
                      <td className="r mono">{r.open}</td>
                      <td className="r mono">{r.verified}</td>
                      <td className={rate > data.falseAlarmTarget ? 'r mono bad' : 'r mono'}>{pct(rate)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

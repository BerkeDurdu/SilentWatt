import type { OverviewData } from '../../shared/types';
import { useApi } from '../api';
import { useMe } from '../auth';
import { Icon } from '../components/icons';
import { LoadError, Loading, PageHead } from '../components/ui';
import { num, shortDay, signedShare } from '../format';
import { useI18n } from '../i18n';

export default function Overview() {
  const { t } = useI18n();
  const me = useMe();
  const { data, error, loading, reload } = useApi<OverviewData>('/overview');
  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  const { observed, evaluation } = data;

  return (
    <>
      <PageHead title={t('ovTitle')} lead={t('ovLead')} />
      {me.fixture && <p className="readonly note"><Icon name="eye" />{t('fixtureNote')}</p>}
      <div className="stack">
        <section className="panel kpis" aria-label={t('kpiAria')}>
          <div className="kpi hero-kpi">
            <span className="eyebrow">{t('kpiOpen')}</span>
            <span className="v">{observed.open}</span>
            <p>{t('kpiOpenP', { d: observed.deviations, q: observed.dataIssues, c: observed.closed })}</p>
          </div>
          <div className="kpi">
            <span className="eyebrow">{t('kpiHouseholds')}</span>
            <span className="v">{num(data.households)}</span>
            <p>{shortDay(data.window.start)} – {shortDay(data.window.end)}</p>
          </div>
          <div className="kpi">
            <span className="eyebrow">{t('kpiSynth')}</span>
            <span className="v">{evaluation ? `${evaluation.syntheticDetected} / ${evaluation.syntheticCases}` : '—'}</span>
            <p>{evaluation ? t('kpiSynthP', { n: evaluation.syntheticCases, s: data.syntheticCases }) : t('noEvaluation')}</p>
          </div>
          <div className="kpi">
            <span className="eyebrow">{t('kpiClean')}</span>
            <span className="v">{evaluation ? evaluation.falseCasesOnCleanData : '—'}</span>
            <p>{evaluation ? t('kpiCleanP', { n: num(evaluation.cleanHouseholdDays), g: evaluation.dataFaultsCaughtByQualityGate }) : t('noEvaluation')}</p>
          </div>
        </section>

        {evaluation && (
          <section className="panel">
            <div className="panel-h"><h2>{t('scenTitle')}</h2><span className="aside">{t('thresholdSrc')}: {data.thresholdProvenance}</span></div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('thScenario')}</th><th className="r">{t('thSeverity')}</th><th className="r">{t('thDuration')}</th>
                    <th className="r">{t('thInjected')}</th><th className="r">{t('thDetected')}</th><th className="r">{t('thDelay')}</th>
                  </tr>
                </thead>
                <tbody>
                  {evaluation.scenarios.map((s, i) => (
                    <tr key={i}>
                      <td>{s.label}</td>
                      <td className="r mono">{s.severity === null ? '—' : signedShare(s.severity)}</td>
                      <td className="r mono">{t('days', { n: s.durationDays })}</td>
                      <td className="r mono">{s.injected}</td>
                      <td className="r mono">{s.detected}</td>
                      <td className="r mono">{s.medianDelayDays === null ? '—' : t('days', { n: s.medianDelayDays })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-h"><h2>{t('hhTitle')}</h2></div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('thHousehold')}</th><th className="r">{t('thOpen')}</th><th className="r">{t('thClosed')}</th>
                  <th className="r">{t('thSynthetic')}</th><th className="r">{t('thScored')}</th><th className="r">{t('thNotScored')}</th>
                </tr>
              </thead>
              <tbody>
                {data.householdRows.map((r) => (
                  <tr key={r.household}>
                    <td>{r.household}</td>
                    <td className="r mono">{r.observedOpen}</td>
                    <td className="r mono">{r.observedClosed}</td>
                    <td className="r mono">{r.synthetic}</td>
                    <td className="r mono">{r.scoredDays}</td>
                    <td className="r mono">{r.notScoredDays}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

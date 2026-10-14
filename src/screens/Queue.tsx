import { useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import type { CaseList } from '../../shared/types';
import { useApi } from '../api';
import { useMe } from '../auth';
import { CaseDetailView } from '../components/CaseDetailView';
import { Sparkline } from '../components/charts';
import { Icon } from '../components/icons';
import { CaseState, GoHome, LoadError, Loading, PageHead, Priority } from '../components/ui';
import type { DictKey } from '../dict';
import { isOpenStatus, shortDay, signedShare } from '../format';
import { useI18n } from '../i18n';

export default function Queue() {
  return (
    <Routes>
      <Route index element={<QueueList />} />
      <Route path=":caseId" element={<CaseDetailView backLabel="backQueue" />} />
      <Route path="*" element={<GoHome />} />
    </Routes>
  );
}

type Filter = 'open' | 'closed' | 'synthetic' | 'all';
const FILTERS: [Filter, DictKey][] = [['open', 'fOpen'], ['closed', 'fClosed'], ['synthetic', 'fSynthetic'], ['all', 'fAll']];

function QueueList() {
  const me = useMe();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('open');
  const [family, setFamily] = useState('');
  const { data, error, loading, reload } = useApi<CaseList>(`/cases?status=${filter}&family=${family}`);
  const readOnly = !me.capabilities.includes('case.assign');

  return (
    <>
      <PageHead title={t('qTitle')} lead={t('qLead')} />
      {readOnly && <p className="readonly note"><Icon name="eye" />{t('qReadOnly')}</p>}
      <section className="panel">
        <div className="filters" role="group" aria-label={t('filterAria')}>
          {FILTERS.map(([key, label]) => (
            <button key={key} className="chip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {t(label)}{data && <b>{data.counts[key]}</b>}
            </button>
          ))}
        </div>
        {data && data.families.length > 1 && (
          <div className="filters" role="group" aria-label={t('familyFilterAria')}>
            <button className="chip" aria-pressed={family === ''} onClick={() => setFamily('')}>
              {t('fAllFamilies')}<b>{data.families.reduce((n, f) => n + f.count, 0)}</b>
            </button>
            {data.families.map((f) => (
              <button key={f.key} className="chip" aria-pressed={family === f.key} onClick={() => setFamily(f.key)}>
                {f.label}<b>{f.count}</b>
              </button>
            ))}
          </div>
        )}
        {error ? (
          <div className="panel-b"><LoadError error={error} onRetry={reload} /></div>
        ) : loading || !data ? (
          <Loading />
        ) : data.items.length === 0 ? (
          <p className="panel-b muted">{t('qEmpty')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('thPriority')}</th><th>{t('thCase')}</th><th>{t('thFinding')}</th>
                  <th className="r">{t('thExcess')}</th><th>{t('thMonth')}</th><th className="r">{t('thFlagged')}</th><th>{t('thStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr
                    key={c.id}
                    className="clickable"
                    tabIndex={0}
                    onClick={() => c.href && navigate(c.href)}
                    onKeyDown={(e) => e.key === 'Enter' && c.href && navigate(c.href)}
                  >
                    <td><Priority priority={c.priority} /></td>
                    <td><span className="mono nowrap">{c.id}</span><span className="sub">{c.household}</span></td>
                    <td>
                      {c.title}
                      <span className="sub">{c.detectorLabel} · {shortDay(c.onsetDate)} – {shortDay(c.lastDate)}</span>
                    </td>
                    <td className="r">
                      {c.excessShare === null
                        ? <span className="muted">{t(c.kind === 'data_issue' ? 'dataIssueShort' : 'notComputed')}</span>
                        : <span className="mono strong warn">{signedShare(c.excessShare)}</span>}
                    </td>
                    <td>
                      <Sparkline
                        observed={c.spark.observed} reference={c.spark.reference} from={c.spark.from} to={c.spark.to}
                        muted={c.origin === 'synthetic' || !isOpenStatus(c.status)}
                      />
                    </td>
                    <td className="r mono">{t('days', { n: c.flaggedDays })}</td>
                    <td>
                      <CaseState status={c.status} origin={c.origin} />
                      {c.customerRequest && <span className="pill req">{t('hasRequest')}</span>}
                      {c.changeReported && <span className="pill chg">{t('hasChange')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

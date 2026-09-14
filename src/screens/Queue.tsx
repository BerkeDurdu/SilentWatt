import { useState } from 'react';
import { Route, Routes, useNavigate } from 'react-router-dom';
import type { CaseList } from '../../shared/types';
import { useApi } from '../api';
import { useMe } from '../auth';
import { CaseDetailView } from '../components/CaseDetailView';
import { Sparkline } from '../components/charts';
import { Icon } from '../components/icons';
import { GoHome, LoadError, Loading, PageHead, Priority, StatusPill } from '../components/ui';
import type { DictKey } from '../dict';
import { isOpenStatus, num, pct, signedPct } from '../format';
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

type Filter = 'open' | 'closed' | 'all';
const FILTERS: [Filter, DictKey][] = [['open', 'fOpen'], ['closed', 'fClosed'], ['all', 'fAll']];

function QueueList() {
  const me = useMe();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('open');
  const { data, error, loading, reload } = useApi<CaseList>(`/cases?status=${filter}`);
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
                  <th>{t('thPriority')}</th><th>{t('thCase')}</th><th>{t('thLocation')}</th><th>{t('thCause')}</th>
                  <th className="r">{t('thDeviation')}</th><th>{t('th30d')}</th><th className="r">{t('thDuration')}</th><th>{t('thStatus')}</th>
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
                    <td><span className="mono">{c.id}</span><span className="sub">{t(`equipment_${c.equipment}`)}</span></td>
                    <td>{c.location}</td>
                    <td>
                      {c.topCause.label}
                      <span className="sub mono">{pct(c.topCause.p * 100)}{c.secondCause && ` · ${c.secondCause.label}`}</span>
                    </td>
                    <td className="r">
                      <span className={c.deviation < 0 ? 'mono strong bad' : 'mono strong warn'}>{signedPct(c.deviation)}</span>
                      <span className="sub mono">{num(c.lossKwhMonth)} {t('kwhMonth')}</span>
                    </td>
                    <td><Sparkline act={c.spark.act} ref={c.spark.ref} onset={c.spark.onset} closed={!isOpenStatus(c.status)} /></td>
                    <td className="r mono">{t('days', { n: c.days })}</td>
                    <td><StatusPill status={c.status} /></td>
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

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CaseDetail, FieldResult, Technician } from '../../shared/types';
import { api, ApiError, useApi } from '../api';
import type { DictKey } from '../dict';
import { dateTime, isOpenStatus, num, pct, signedPct } from '../format';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { CaseChart } from './charts';
import { Icon } from './icons';
import { LoadError, Loading, Priority, StatusPill } from './ui';

export function CaseDetailView({ backLabel }: { backLabel: DictKey }) {
  const { t } = useI18n();
  const { caseId = '' } = useParams();
  const { data, error, loading, reload, setData } = useApi<CaseDetail>(`/cases/${encodeURIComponent(caseId)}`);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  const c = data;
  const chartTitle = t(c.equipment === 'pv' ? 'chartPv' : 'chartHp');

  return (
    <>
      <Link className="btn quiet" to=".." relative="path"><Icon name="back" />{t(backLabel)}</Link>
      <div className="case-head">
        <div className="case-meta">
          <span className="case-id">{c.id}</span>
          <StatusPill status={c.status} />
          <Priority priority={c.priority} />
        </div>
        <h1>{c.topCause.label}</h1>
      </div>

      <div className="case-layout">
        <div className="stack">
          <section className="panel">
            <div className="panel-b verdict">
              <span className={c.deviation < 0 ? 'big down' : 'big'}>{signedPct(c.deviation)}</span>
              <p>
                {t(c.deviation < 0 ? 'belowExpected' : 'aboveRef')}
                <span className="sub">{t('persistent', { d: c.days, k: num(c.lossKwhMonth) })}</span>
              </p>
            </div>
            <div className="panel-h">
              <h2>{chartTitle}</h2>
              <span className="aside legend">
                <span><i style={{ background: 'var(--ink)' }} />{t('lgMeasured')}</span>
                <span><i style={{ background: 'var(--brand)' }} />{t('lgReference')}</span>
                <span><i className="band-swatch" />{t('lgInterval')}</span>
              </span>
            </div>
            <div className="panel-b chart-wrap">
              <CaseChart series={c.series} onset={c.onset} deviation={c.deviation} title={chartTitle} />
            </div>
          </section>

          <div className="two">
            <section className="panel">
              <div className="panel-h"><h2>{t('hypotheses')}</h2><span className="aside">{t('conformal')}</span></div>
              <div className="panel-b">
                {c.hypotheses.map((h) => (
                  <div key={h.key} className={h.inSet ? 'hyp in' : 'hyp'}>
                    <span>{h.label}</span>
                    <div className="track"><div className="fill" style={{ width: `${h.p * 100}%` }} /></div>
                    <span className="p">{pct(h.p * 100)}</span>
                  </div>
                ))}
                <div className="hyp">
                  <span className="muted">{t('otherUnknown')}</span>
                  <div className="track"><div className="fill rest" style={{ width: `${c.other * 100}%` }} /></div>
                  <span className="p muted">{pct(c.other * 100)}</span>
                </div>
                <p className="set-note">
                  {t('setNoteA')} <span className="mono">{`{${c.hypotheses.filter((h) => h.inSet).map((h) => h.label).join(', ')}}`}</span>.{' '}
                  {t('setNoteB')}
                </p>
              </div>
            </section>
            <section className="panel">
              <div className="panel-h"><h2>{t('evidence')}</h2></div>
              <div className="panel-b">
                <ul className="evidence">
                  {c.evidence.map((e) => <li key={e}><Icon name="step" /><span>{e}</span></li>)}
                </ul>
              </div>
            </section>
          </div>
        </div>

        <div className="stack">
          <section className="next">
            <span className="eyebrow">{t('firstCheck')}</span>
            <h3>{c.firstCheck}</h3>
            <p>{t('firstCheckP')}</p>
          </section>

          <section className="panel">
            <div className="panel-h"><h2>{t('action')}</h2></div>
            <div className="panel-b"><CaseActions detail={c} onChange={setData} /></div>
          </section>

          <section className="panel">
            <div className="panel-h"><h2>{t('site')}</h2></div>
            <div className="panel-b">
              <dl className="kv">
                <dt>{t('address')}</dt><dd>{c.location}</dd>
                <dt>{t('meter')}</dt><dd className="mono">{c.meter}</dd>
                <dt>{t('equipment')}</dt><dd>{t(`equipment_${c.equipment}`)}</dd>
                <dt>{t('estLoss')}</dt><dd className="mono">≈ {num(c.lossKwhMonth)} {t('kwhMonth')}</dd>
                {c.technicianName && <><dt>{t('technician')}</dt><dd>{c.technicianName}</dd></>}
              </dl>
              {c.masked && <p className="masked"><Icon name="lock" />{t('masked')}</p>}
            </div>
          </section>

          <section className="panel">
            <div className="panel-h"><h2>{t('history')}</h2></div>
            <div className="panel-b">
              <ol className="timeline">
                {c.events.map((e, i) => (
                  <li key={i}>
                    <span>{e.label}</span>
                    {e.note && <q>{e.note}</q>}
                    <span className="t">{dateTime(e.at)}</span>
                  </li>
                ))}
              </ol>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function CaseActions({ detail, onChange }: { detail: CaseDetail; onChange: (d: CaseDetail) => void }) {
  const { t } = useI18n();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [result, setResult] = useState<FieldResult | ''>('');
  const [note, setNote] = useState('');
  const { actions } = detail;

  useEffect(() => {
    if (!actions.assign) return;
    api<Technician[]>('/technicians')
      .then((list) => {
        setTechnicians(list);
        setTechnicianId((cur) => cur || list[0]?.id || '');
      })
      .catch(() => setTechnicians([]));
  }, [actions.assign]);

  async function run(action: string, body: unknown, success: (d: CaseDetail) => string) {
    setBusy(true);
    try {
      const updated = await api<CaseDetail>(`/cases/${encodeURIComponent(detail.id)}/${action}`, { method: 'POST', body });
      onChange(updated);
      toast(success(updated));
    } catch (err) {
      toast(t(err instanceof ApiError && err.status === 409 ? 'errConflict' : 'errAction'));
    } finally {
      setBusy(false);
    }
  }

  if (actions.assign || actions.review || actions.dismiss) {
    return (
      <div className="form">
        {actions.review && (
          <button className="btn" disabled={busy} onClick={() => run('review', {}, (d) => t('tReviewed', { id: d.id }))}>
            {t('moveReview')}
          </button>
        )}
        {actions.assign && (
          <>
            <label className="field">
              <span>{t('technician')}</span>
              <select value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
              </select>
            </label>
            <button
              className="btn primary"
              disabled={busy || !technicianId}
              onClick={() => run('assign', { technicianId }, (d) => t('tAssigned', { id: d.id, name: d.technicianName ?? '' }))}
            >
              <Icon name="send" />{t('assignSms')}
            </button>
          </>
        )}
        {actions.dismiss && (
          <button className="btn quiet" disabled={busy} onClick={() => run('dismiss', {}, (d) => t('tDismissed', { id: d.id }))}>
            {t('dismiss')}
          </button>
        )}
      </div>
    );
  }

  if (actions.result) {
    const options: [FieldResult, DictKey][] = [['verified', 'resVerified'], ['other', 'resOther'], ['dismissed', 'resDismissed']];
    return (
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!result) return toast(t('pickResult'));
          void run('result', { result, note }, () => t('tResult'));
        }}
      >
        <fieldset className="radios">
          <legend className="eyebrow">{t('whatFound')}</legend>
          {options.map(([value, label]) => (
            <label key={value}>
              <input type="radio" name="result" value={value} checked={result === value} onChange={() => setResult(value)} />
              {t(label)}
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>{t('noteOptional')}</span>
          <textarea maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('notePh')} />
        </label>
        <button className="btn primary" type="submit" disabled={busy}>{t('saveResult')}</button>
      </form>
    );
  }

  const text = !isOpenStatus(detail.status)
    ? t('roClosed')
    : detail.status === 'assigned'
      ? t('roAssigned', { name: detail.technicianName ?? '' })
      : t('roView');
  return <p className="readonly"><Icon name="eye" />{text}</p>;
}

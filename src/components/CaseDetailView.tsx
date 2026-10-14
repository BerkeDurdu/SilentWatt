import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { ChangeKind } from '../../shared/evidence';
import type { CaseDetail, FieldResult, Technician } from '../../shared/types';
import { api, ApiError, useApi } from '../api';
import type { DictKey } from '../dict';
import { dateTime, isOpenStatus, share, shortDay, signedShare } from '../format';
import { useI18n } from '../i18n';
import { useToast } from '../toast';
import { AssistantPanel } from './AssistantPanel';
import { DailyChart, SeriesChart } from './charts';
import { Icon } from './icons';
import { CaseState, LoadError, Loading, Priority } from './ui';

export function CaseDetailView({ backLabel }: { backLabel: DictKey }) {
  const { t } = useI18n();
  const { caseId = '' } = useParams();
  const { data, error, loading, reload, setData } = useApi<CaseDetail>(`/cases/${encodeURIComponent(caseId)}`);

  if (error) return <LoadError error={error} onRetry={reload} />;
  if (loading || !data) return <Loading />;

  const c = data;
  const { explanation } = c;

  return (
    <>
      <Link className="btn quiet" to=".." relative="path"><Icon name="back" />{t(backLabel)}</Link>
      <div className="case-head">
        <div className="case-meta">
          <span className="case-id">{c.id}</span>
          <CaseState status={c.status} origin={c.origin} />
          <Priority priority={c.priority} />
        </div>
        <h1>{c.title}</h1>
      </div>

      {c.synthetic && (
        <div className="syn-banner" role="note">
          <p>{t('synBanner')}</p>
          <dl>
            <div><dt>{t('synScenario')}</dt><dd>{c.synthetic.scenarioLabel}{c.synthetic.severity !== null && ` · ${signedShare(c.synthetic.severity)}`} · {t('days', { n: c.synthetic.durationDays })}</dd></div>
            <div><dt>{t('synStart')}</dt><dd>{shortDay(c.synthetic.startDate)}</dd></div>
          </dl>
        </div>
      )}

      <div className="case-layout">
        <div className="stack">
          <section className="panel">
            <div className="panel-b verdict">
              {c.excessShare === null ? (
                <p>{t(c.kind === 'data_issue' ? 'verdictData' : 'notComputed')}</p>
              ) : (
                <>
                  <span className="big">{signedShare(c.excessShare)}</span>
                  <p>
                    {t(c.excessShare < 0 ? 'belowRef' : 'aboveRef')}
                    <span className="sub">
                      {t('verdictSub', { n: c.flaggedDays, from: shortDay(c.onsetDate), to: shortDay(c.lastDate) })}
                      {c.upperExceedanceShare !== null && ` · ${t('upperShare', { v: share(c.upperExceedanceShare) })}`}
                      {c.lowerShortfallShare !== null && ` · ${t('lowerShare', { v: share(c.lowerShortfallShare) })}`}
                    </span>
                  </p>
                </>
              )}
            </div>
            <div className="panel-h">
              <h2>{t('chartDaily')}</h2>
              <span className="aside legend">
                <span><i style={{ background: 'var(--ink)' }} />{t('lgMeasured')}</span>
                <span><i style={{ background: 'var(--brand)' }} />{t('lgReference')}</span>
                <span><i style={{ background: 'var(--amber)' }} />{t('lgFlagged')}</span>
                <span><i className="hatch-swatch" />{t('lgNotScored')}</span>
              </span>
            </div>
            <div className="panel-b chart-wrap">
              <DailyChart daily={c.daily} onset={c.onsetDate} last={c.lastDate} title={t('chartDaily')} />
            </div>
          </section>

          <section className="panel">
            <div className="panel-h">
              <h2>{t('chartSeries')}</h2>
              <span className="aside legend">
                <span><i style={{ background: 'var(--ink)' }} />{t('lgMeasured')}</span>
                <span><i style={{ background: 'var(--brand)' }} />{t('lgReference')}</span>
                <span><i className="band-swatch" />{t('lgInterval')}</span>
                <span><i className="hatch-swatch" />{t('lgNotScored')}</span>
              </span>
            </div>
            <div className="panel-b chart-wrap">
              <SeriesChart series={c.series} title={t('chartSeries')} />
            </div>
          </section>

          <div className="two">
            <section className="panel">
              <div className="panel-h"><h2>{t('reasonsTitle')}</h2></div>
              <div className="panel-b">
                <ul className="evidence">
                  {explanation.reasons.map((r) => <li key={r}><Icon name="step" /><span>{r}</span></li>)}
                </ul>
              </div>
            </section>
            <section className="panel">
              <div className="panel-h"><h2>{t('explainTitle')}</h2></div>
              <div className="panel-b">
                <p className="explain">{explanation.summary}</p>
                <ul className="limits">
                  {explanation.limitations.map((x) => <li key={x}>{x}</li>)}
                </ul>
                <p className="set-note">{explanation.humanDecisionNote}</p>
              </div>
            </section>
          </div>

          <AssistantPanel caseId={c.id} />
        </div>

        <div className="stack">
          <section className="next">
            <span className="eyebrow">{t('firstCheck')}</span>
            <h3>{explanation.recommendation.firstCheck}</h3>
            {explanation.recommendation.steps.length > 0 && (
              <ol>{explanation.recommendation.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            )}
            <p>{explanation.humanDecisionNote}</p>
          </section>

          <section className="panel">
            <div className="panel-h"><h2>{t('action')}</h2></div>
            <div className="panel-b"><CaseActions detail={c} onChange={setData} /></div>
          </section>

          <section className="panel">
            <div className="panel-h"><h2>{t('site')}</h2></div>
            <div className="panel-b">
              <dl className="kv">
                <dt>{t('household')}</dt><dd className="mono">{c.household}</dd>
                <dt>{t('channel')}</dt><dd className="mono">{c.run.circuit}</dd>
                <dt>{t('expectedFrom')}</dt><dd>{c.run.expectedFrom}</dd>
                <dt>{t('detector')}</dt><dd>{c.detectorLabel}</dd>
                <dt>{t('detectedOn')}</dt><dd>{shortDay(c.detectedDate)}</dd>
                <dt>{t('modelProtocol')}</dt><dd className="mono">{c.run.model} · {c.run.protocol}</dd>
                <dt>{t('thresholdSrc')}</dt><dd>{c.run.thresholdProvenance}</dd>
                <dt>{t('address')}</dt><dd>{c.location}</dd>
                {c.technicianName && <><dt>{t('technician')}</dt><dd>{c.technicianName}</dd></>}
              </dl>
              <p className="masked"><Icon name="eye" />{t('exampleRecord')}</p>
              {c.masked && <p className="masked"><Icon name="lock" />{t('masked')}</p>}
            </div>
          </section>

          {c.origin === 'observed' && (
            <section className="panel">
              <div className="panel-h"><h2>{t('changesTitle')}</h2></div>
              <div className="panel-b">
                {c.changes.length === 0 ? (
                  <p className="muted">{t('changesNone')}</p>
                ) : (
                  <ul className="changes">
                    {c.changes.map((ch) => (
                      <li key={`${ch.at}-${ch.kind}`}>
                        <b>{ch.kindLabel}</b>
                        <span className="sub">{ch.sourceLabel} · {t('changeDate')}: {shortDay(ch.localDate)}{ch.note && ` · ${ch.note}`}</span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="masked"><Icon name="eye" />{t('changesHint')}</p>
              </div>
            </section>
          )}

          {c.notice && (
            <section className="panel">
              <div className="panel-h"><h2>{t('custNotice')}</h2></div>
              <div className="panel-b">
                <p className="bubble">
                  {c.notice.text}{' '}
                  {c.notice.href
                    ? <a className="link mono" href={c.notice.href} target="_blank" rel="noreferrer">{c.notice.linkText}</a>
                    : <span className="mono muted">{c.notice.linkText}</span>}
                </p>
                {c.notice.href ? (
                  <a className="btn quiet sms-link" href={c.notice.href} target="_blank" rel="noreferrer">
                    <Icon name="send" />{t('custOpenLink')}
                  </a>
                ) : (
                  <p className="masked"><Icon name="lock" />{t('custLinkMasked')}</p>
                )}
              </div>
            </section>
          )}

          {(c.request || (c.origin === 'observed' && c.kind !== 'data_issue')) && (
            <section className="panel">
              <div className="panel-h"><h2>{t('custRequest')}</h2></div>
              <div className="panel-b">
                {c.request ? (
                  <>
                    <dl className="kv">
                      <dt>{t('custRef')}</dt><dd className="mono">{c.request.reference}</dd>
                      <dt>{t('pubName')}</dt><dd>{c.request.name}</dd>
                      <dt>{t('custPhone')}</dt><dd className="mono">{c.request.phone}</dd>
                      {c.request.email && <><dt>{t('custEmail')}</dt><dd>{c.request.email}</dd></>}
                      <dt>{t('address')}</dt>
                      <dd>
                        {c.request.address}
                        {c.request.addressEdited && !c.request.masked && <span className="sub">{t('custEdited')}</span>}
                      </dd>
                      <dt>{t('custSlot')}</dt><dd>{c.request.slotLabel}</dd>
                      {c.request.changeLabel && <><dt>{t('custChange')}</dt><dd>{c.request.changeLabel}</dd></>}
                    </dl>
                    {c.request.note && <p className="bubble note-quote">{c.request.note}</p>}
                    {c.request.masked && <p className="masked"><Icon name="lock" />{t('custMaskedAddr')}</p>}
                  </>
                ) : (
                  <p className="muted">{t('custNone')}</p>
                )}
              </div>
            </section>
          )}

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
  const [changeKind, setChangeKind] = useState<ChangeKind>(detail.changeOptions[0]?.value ?? 'new_device');
  const [changeDate, setChangeDate] = useState(detail.onsetDate);
  const [changeNote, setChangeNote] = useState('');
  const [explaining, setExplaining] = useState(false);
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

  const explainForm = actions.explain && (explaining ? (
    <div className="form">
      <label className="field">
        <span>{t('changeKind')}</span>
        <select value={changeKind} onChange={(e) => setChangeKind(e.target.value as ChangeKind)}>
          {detail.changeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="field">
        <span>{t('changeDate')}</span>
        <input type="date" value={changeDate} min="2018-07-01" max="2018-07-31" onChange={(e) => setChangeDate(e.target.value)} />
      </label>
      <label className="field">
        <span>{t('changeNote')}</span>
        <input type="text" maxLength={300} value={changeNote} onChange={(e) => setChangeNote(e.target.value)} />
      </label>
      <button
        className="btn primary" disabled={busy}
        onClick={() => run('explain', { kind: changeKind, localDate: changeDate, note: changeNote }, (d) => t('tExplained', { id: d.id }))}
      >
        {t('explainAction')}
      </button>
    </div>
  ) : (
    <button className="btn quiet" disabled={busy} onClick={() => setExplaining(true)}>{t('explainAction')}</button>
  ));

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
        {explainForm}
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

  const text = detail.origin === 'synthetic'
    ? t('roSynthetic')
    : detail.status === 'explained'
      ? t('roExplained')
      : !isOpenStatus(detail.status)
      ? t('roClosed')
      : detail.status === 'assigned'
        ? t('roAssigned', { name: detail.technicianName ?? '' })
        : t('roView');
  return (
    <div className="form">
      <p className="readonly"><Icon name="eye" />{text}</p>
      {explainForm}
    </div>
  );
}

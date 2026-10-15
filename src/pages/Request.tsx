import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { ChangeKind } from '../../shared/evidence';
import type { RequestPage, RequestReceipt, RequestSlot } from '../../shared/types';
import { api, ApiError, useApi } from '../api';
import { Icon, Logo, Wordmark } from '../components/icons';
import { LangToggle, Loading } from '../components/ui';
import type { DictKey } from '../dict';
import { dateTime, signedShare } from '../format';
import { useI18n } from '../i18n';

/**
 * The page behind the link in the resident's SMS. No account and no sign-in, but the link alone shows
 * nothing personal: the resident first types the last four digits of the subscriber number on their bill.
 */
export default function RequestPageView() {
  const { token = '' } = useParams();
  const { t, lang } = useI18n();
  const path = `/public/request/${encodeURIComponent(token)}`;
  const gate = useApi<{ verify: true }>(path);
  const [code, setCode] = useState<string | null>(null);
  const [data, setData] = useState<RequestPage | null>(null);
  const [lost, setLost] = useState<'expired' | 'locked' | null>(null);
  const [receipt, setReceipt] = useState<RequestReceipt | null>(null);
  const [editing, setEditing] = useState(false);

  // A language switch fetches the opened page again in that language, receipt included.
  useEffect(() => {
    if (!code) return;
    api<RequestPage>(`${path}/open`, { method: 'POST', body: { code } })
      .then(setData)
      .catch((e: unknown) => e instanceof ApiError && (e.code === 'expired' || e.code === 'locked') && setLost(e.code));
  }, [lang]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (data) setReceipt(data.submitted);
  }, [data]);

  const error = gate.error;
  const expired = lost === 'expired' || error?.status === 410;

  return (
    <div className="pub">
      <header className="pub-top">
        <div className="brand">
          <Logo size={34} />
          <span className="brand-text"><Wordmark /></span>
        </div>
        <LangToggle />
      </header>

      <main className="pub-main">
        {expired ? (
          <section className="pub-card">
            <h1>{t('pubExpiredTitle')}</h1>
            <p>{t('pubExpiredBody')}</p>
          </section>
        ) : error ? (
          <ErrorCard onRetry={gate.reload} notFound={error.status === 404} />
        ) : gate.loading ? (
          <Loading />
        ) : !data || !code ? (
          <VerifyCard
            path={path}
            onOpen={(c, page) => {
              setCode(c);
              setData(page);
            }}
            onExpired={() => setLost('expired')}
          />
        ) : receipt && !editing ? (
          <Receipt data={data} receipt={receipt} onEdit={() => setEditing(true)} />
        ) : (
          <>
            <Notice data={data} />
            <RequestForm
              token={token}
              code={code}
              data={data}
              current={receipt}
              onDone={(r) => {
                setReceipt(r);
                setEditing(false);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
            />
          </>
        )}
      </main>

      <footer className="pub-foot">
        <span>{t('pubPrivacy')}</span>
        {data && <span className="mono">{data.caseId}</span>}
      </footer>
    </div>
  );
}

function ErrorCard({ notFound, onRetry }: { notFound: boolean; onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <section className="pub-card">
      <h1>{t(notFound ? 'pubBadTitle' : 'loadErrorData')}</h1>
      <p>{t(notFound ? 'pubBadBody' : 'loadErrorHint')}</p>
      {!notFound && <button className="btn" onClick={onRetry}>{t('retry')}</button>}
    </section>
  );
}

const CODE_ERRORS: Record<string, DictKey> = { wrong_code: 'pubErrCode', locked: 'pubErrLocked', too_many_requests: 'pubErrTooMany' };

/** Asks for the last four digits of the subscriber number before anything about the home is shown. */
function VerifyCard({ path, onOpen, onExpired }: { path: string; onOpen: (code: string, page: RequestPage) => void; onExpired: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState('');
  const [error, setError] = useState<DictKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onOpen(code, await api<RequestPage>(`${path}/open`, { method: 'POST', body: { code } }));
    } catch (err) {
      if (err instanceof ApiError && err.code === 'expired') return onExpired();
      setError(err instanceof ApiError ? CODE_ERRORS[err.code] ?? 'pubErrSend' : 'pubErrSend');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pub-card" onSubmit={submit} noValidate>
      <span className="eyebrow">{t('pubEyebrow')}</span>
      <h1>{t('pubVerifyTitle')}</h1>
      <p className="pub-lead">{t('pubVerifyBody')}</p>
      <div className="form">
        <label className="field">
          <span>{t('pubCode')}</span>
          <input
            type="text" inputMode="numeric" autoComplete="off" maxLength={4} pattern="[0-9]{4}"
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))} required
          />
          <small className="fine left">{t('pubCodeHint')}</small>
        </label>
        {error && <div className="form-error" role="alert">{t(error)}</div>}
        <button className="btn primary block" type="submit" disabled={busy || code.length !== 4}>
          {busy ? t('pubOpening') : t('pubOpen')}
        </button>
      </div>
    </form>
  );
}

function Notice({ data }: { data: RequestPage }) {
  const { t } = useI18n();
  return (
    <section className="pub-card">
      <span className="eyebrow">{t('pubEyebrow')}</span>
      <h1>{data.headline}</h1>
      <p className="pub-lead">{data.body}</p>

      <dl className="pub-facts">
        {data.excessShare !== null && <div><dt>{t('pubExcess')}</dt><dd className="mono">{signedShare(data.excessShare)}</dd></div>}
        <div><dt>{t('pubDuration')}</dt><dd className="mono">{t('days', { n: data.days })}</dd></div>
        <div><dt>{t('pubEquipment')}</dt><dd>{data.equipmentLabel}</dd></div>
      </dl>

      <h2 className="pub-sub">{t('pubWhy')}</h2>
      <ul className="evidence">
        {data.points.map((p) => <li key={p}><Icon name="step" /><span>{p}</span></li>)}
      </ul>
      <p className="fine pub-sent">{dateTime(data.noticeAt)}</p>
    </section>
  );
}

const ERRORS: Record<string, DictKey> = {
  invalid_name: 'pubErrName',
  invalid_phone: 'pubErrPhone',
  invalid_email: 'pubErrEmail',
  invalid_address: 'pubErrAddress',
  invalid_slot: 'pubErrSlot',
  invalid_change: 'pubErrChange',
  too_many_requests: 'pubErrTooMany',
  too_many_updates: 'pubErrUpdates',
  expired: 'pubExpiredTitle',
  wrong_code: 'pubErrCode',
  locked: 'pubErrLocked',
};

function RequestForm(
  { token, code, data, current, onDone }:
  { token: string; code: string; data: RequestPage; current: RequestReceipt | null; onDone: (r: RequestReceipt) => void },
) {
  const { t } = useI18n();
  const [name, setName] = useState(current?.name ?? data.customer.name);
  const [phone, setPhone] = useState(current?.phone ?? data.customer.phone);
  const [email, setEmail] = useState(data.customer.email);
  const [address, setAddress] = useState(current?.address ?? data.customer.address);
  const [slot, setSlot] = useState<RequestSlot>(data.slots[0].value);
  const [note, setNote] = useState(current?.note ?? '');
  const [change, setChange] = useState<ChangeKind | ''>('');
  const [error, setError] = useState<DictKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const receipt = await api<RequestReceipt>(`/public/request/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: { code, name, phone, email, address, slot, note, change },
      });
      onDone(receipt);
    } catch (err) {
      setError(err instanceof ApiError ? ERRORS[err.code] ?? 'pubErrSend' : 'pubErrSend');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pub-card" onSubmit={submit} noValidate>
      <h2>{t('pubFormTitle')}</h2>
      <p className="muted">{t('pubFormLead')}</p>

      <div className="form">
        <div className="two-fields">
          <label className="field">
            <span>{t('pubName')}</span>
            <input type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="field">
            <span>{t('pubPhone')}</span>
            <input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required />
          </label>
        </div>

        <label className="field">
          <span>{t('pubEmail')}</span>
          <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>

        <label className="field">
          <span>{t('pubAddress')}</span>
          <textarea value={address} onChange={(e) => setAddress(e.target.value)} required />
          <small className="fine left">{t('pubAddressHint')}</small>
        </label>

        <label className="field">
          <span>{t('pubSlot')}</span>
          <select value={slot} onChange={(e) => setSlot(e.target.value as RequestSlot)}>
            {data.slots.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>

        <label className="field">
          <span>{data.changeQuestion}</span>
          <select value={change} onChange={(e) => setChange(e.target.value as ChangeKind | '')}>
            <option value="">{t('pubChangeNone')}</option>
            {data.changeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>

        <label className="field">
          <span>{t('pubNote')}</span>
          <textarea maxLength={400} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('pubNotePh')} />
        </label>

        {error && <div className="form-error" role="alert">{t(error)}</div>}

        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? t('pubSubmitting') : t(current ? 'pubUpdate' : 'pubSubmit')}
        </button>
      </div>
    </form>
  );
}

function Receipt({ data, receipt, onEdit }: { data: RequestPage; receipt: RequestReceipt; onEdit: () => void }) {
  const { t } = useI18n();
  return (
    <section className="pub-card done">
      <span className="pub-tick"><Icon name="check" /></span>
      <h1>{t('pubDoneTitle')}</h1>
      <p className="pub-lead">{t('pubDoneBody', { name: receipt.name, phone: receipt.phone })}</p>
      <dl className="kv pub-kv">
        <dt>{t('custRef')}</dt><dd className="mono">{receipt.reference}</dd>
        <dt>{t('pubSlot')}</dt><dd>{receipt.slotLabel}</dd>
        <dt>{t('pubDoneAddress')}</dt><dd>{receipt.address}</dd>
        {receipt.note && <><dt>{t('pubNote')}</dt><dd>{receipt.note}</dd></>}
        {receipt.changeLabel && <><dt>{t('custChange')}</dt><dd>{receipt.changeLabel}</dd></>}
        <dt>{t('pubEquipment')}</dt><dd>{data.equipmentLabel}</dd>
      </dl>
      <button className="btn" onClick={onEdit}>{t('pubEditAgain')}</button>
    </section>
  );
}

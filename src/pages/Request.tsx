import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import type { RequestPage, RequestReceipt, RequestSlot } from '../../shared/types';
import { api, ApiError, useApi } from '../api';
import { Icon, Logo, Wordmark } from '../components/icons';
import { LangToggle, Loading } from '../components/ui';
import type { DictKey } from '../dict';
import { dateTime, num } from '../format';
import { useI18n } from '../i18n';

/**
 * The page behind the link in the resident's SMS. No account and no sign-in:
 * the token in the address is the whole key, and it only ever opens this one case.
 */
export default function RequestPageView() {
  const { token = '' } = useParams();
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi<RequestPage>(`/public/request/${encodeURIComponent(token)}`);
  const [receipt, setReceipt] = useState<RequestReceipt | null>(null);
  const [editing, setEditing] = useState(false);

  // A language switch refetches the page; keep the receipt in that language too.
  useEffect(() => {
    if (data) setReceipt(data.submitted);
  }, [data]);

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
        {error ? (
          <ErrorCard onRetry={reload} notFound={error.status === 404} />
        ) : loading || !data ? (
          <Loading />
        ) : receipt && !editing ? (
          <Receipt data={data} receipt={receipt} onEdit={() => setEditing(true)} />
        ) : (
          <>
            <Notice data={data} />
            <RequestForm
              token={token}
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

function Notice({ data }: { data: RequestPage }) {
  const { t } = useI18n();
  return (
    <section className="pub-card">
      <span className="eyebrow">{t('pubEyebrow')}</span>
      <h1>{data.headline}</h1>
      <p className="pub-lead">{data.body}</p>

      <dl className="pub-facts">
        <div><dt>{t('pubLoss')}</dt><dd className="mono">≈ {num(data.lossKwhMonth)} {t('kwhMonth')}</dd></div>
        <div><dt>{t('pubDuration')}</dt><dd className="mono">{t('days', { n: data.days })}</dd></div>
        <div><dt>{t('pubEquipment')}</dt><dd>{data.equipmentLabel}</dd></div>
      </dl>

      <h2 className="pub-sub">{t('pubWhy')}</h2>
      <ul className="evidence">
        {data.points.map((p) => <li key={p}><Icon name="step" /><span>{p}</span></li>)}
      </ul>
      {data.closed && <p className="pub-closed">{t('pubClosed')}</p>}
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
  too_many_requests: 'pubErrTooMany',
};

function RequestForm(
  { token, data, current, onDone }:
  { token: string; data: RequestPage; current: RequestReceipt | null; onDone: (r: RequestReceipt) => void },
) {
  const { t } = useI18n();
  const [name, setName] = useState(current?.name ?? data.customer.name);
  const [phone, setPhone] = useState(current?.phone ?? data.customer.phone);
  const [email, setEmail] = useState(data.customer.email);
  const [address, setAddress] = useState(current?.address ?? data.customer.address);
  const [slot, setSlot] = useState<RequestSlot>(data.slots[0].value);
  const [note, setNote] = useState(current?.note ?? '');
  const [error, setError] = useState<DictKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const receipt = await api<RequestReceipt>(`/public/request/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: { name, phone, email, address, slot, note },
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
        <dt>{t('pubEquipment')}</dt><dd>{data.equipmentLabel}</dd>
      </dl>
      <button className="btn" onClick={onEdit}>{t('pubEditAgain')}</button>
    </section>
  );
}

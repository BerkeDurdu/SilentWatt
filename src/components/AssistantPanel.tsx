import { useEffect, useState, type FormEvent } from 'react';
import type { AssistantAnswer, AssistantStatus } from '../../shared/types';
import { api, ApiError, useApi } from '../api';
import type { DictKey } from '../dict';
import { useI18n } from '../i18n';
import { Icon } from './icons';

/** A language model summarises the case and answers questions from its evidence; the server guards every text. */
export function AssistantPanel({ caseId }: { caseId: string }) {
  const { t, lang } = useI18n();
  const status = useApi<AssistantStatus>('/assistant');
  const live = Boolean(status.data?.enabled && status.data.reachable);
  const [summary, setSummary] = useState<AssistantAnswer | null>(null);
  const [answers, setAnswers] = useState<AssistantAnswer[]>([]);
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSummary(null);
    setAnswers([]);
    if (!live) return;
    let alive = true;
    setBusy(true);
    api<AssistantAnswer>(`/cases/${encodeURIComponent(caseId)}/assistant`, { method: 'POST', body: {} })
      .then((a) => alive && setSummary(a))
      .catch(() => alive && setError(t('loadErrorData')))
      .finally(() => alive && setBusy(false));
    return () => {
      alive = false;
    };
    // t changes with lang, which is already a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, live, lang]);

  async function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      const a = await api<AssistantAnswer>(`/cases/${encodeURIComponent(caseId)}/assistant`, { method: 'POST', body: { question: q } });
      setAnswers((list) => [a, ...list]);
      setQuestion('');
    } catch (e) {
      setError(e instanceof ApiError && e.status === 429 ? t('loadErrorHint') : t('loadErrorData'));
    } finally {
      setBusy(false);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void ask(question);
  };

  const s = status.data;
  return (
    <section className="panel ai">
      <div className="panel-h">
        <h2><Icon name="spark" />{t('aiTitle')}</h2>
        {s?.enabled && (
          <span className="aside mono">
            <i className={`dot ${live ? 'on' : 'off'}`} />{s.model} · {t(`ai_${s.location ?? 'local'}` as DictKey)}
          </span>
        )}
      </div>
      <div className="panel-b">
        {status.loading ? (
          <p className="muted">{t('loading')}</p>
        ) : !live ? (
          <p className="muted">{t(s?.enabled ? 'aiFb_unreachable' : 'aiFb_disabled')}</p>
        ) : (
          <>
            {summary ? <Answer a={summary} /> : busy && <p className="muted ai-wait">{t('aiWriting')}</p>}

            {answers.map((a, i) => (
              <div className="ai-qa" key={`${answers.length - i}`}>
                <p className="ai-q">{a.question}</p>
                <Answer a={a} />
              </div>
            ))}
            {busy && summary && <p className="muted ai-wait">{t('aiWriting')}</p>}

            <form className="ai-ask" onSubmit={submit}>
              <label htmlFor="ai-q" className="eyebrow">{t('aiAskLabel')}</label>
              <div className="ai-suggest">
                {(['aiQ1', 'aiQ2', 'aiQ3'] as const).map((k) => (
                  <button key={k} type="button" className="chip" disabled={busy} onClick={() => void ask(t(k))}>{t(k)}</button>
                ))}
              </div>
              <div className="ai-row">
                <input id="ai-q" type="text" maxLength={300} value={question} placeholder={t('aiAskPh')} onChange={(e) => setQuestion(e.target.value)} />
                <button className="btn primary" type="submit" disabled={busy || !question.trim()}><Icon name="send" />{t('aiAsk')}</button>
              </div>
            </form>
            {error && <div className="form-error" role="alert">{error}</div>}
          </>
        )}
        <p className="masked"><Icon name="lock" />{t('aiScope')}</p>
      </div>
    </section>
  );
}

function Answer({ a }: { a: AssistantAnswer }) {
  const { t } = useI18n();
  return (
    <div className={`ai-answer ${a.provider}`}>
      <p className="explain">{a.text}</p>
      <p className="ai-meta">
        {a.provider === 'llm' ? (
          <>
            <span className="ok"><Icon name="check" />{t('aiPassed')}</span>
            {a.guard.attempts > 1 && <span>{t('aiRetried')}</span>}
            <span>{a.cached ? t('aiCached') : t('aiSeconds', { s: (a.ms / 1000).toFixed(1) })}</span>
          </>
        ) : (
          <span className="warn">{t(`aiFb_${a.fallback ?? 'disabled'}` as DictKey)}</span>
        )}
      </p>
      <p className="set-note">{a.humanDecisionNote}</p>
    </div>
  );
}

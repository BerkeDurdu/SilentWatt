// Case explanations from structured evidence (contract: docs/architecture/evidence-contract.md).
//
// Template provider: every sentence is built from fields of the evidence, then checked by a guard
// (no forbidden wording, every number comes from the evidence, the human-decision sentence is there).
// An LLM provider can be plugged in behind the same interface; a failed guard falls back to the template.

import type { EvidenceCase, EvidenceReason, RecommendationCode } from '../../shared/evidence';
import type { Lang } from '../../shared/types';

export interface Explanation {
  /** Which provider wrote the text; 'template' until an LLM provider is plugged in. */
  provider: 'template' | 'llm';
  /** One short paragraph that says what was observed, in the user's language. */
  summary: string;
  /** One sentence per evidence reason, in the order of evidence.reasons. */
  reasons: string[];
  recommendation: { firstCheck: string; steps: string[] };
  limitations: string[];
  /** Always present: people decide, the product only recommends an inspection. */
  humanDecisionNote: string;
  /** Result of the wording and number checks; a failed guard falls back to the template. */
  guard: { passed: boolean; violations: string[] };
}

type Text = Record<Lang, string>;

const HUMAN_DECISION: Text = {
  tr: 'Bu bir inceleme önerisidir; kararı ekip verir.',
  en: 'This is an inspection recommendation; the team decides.',
};

/** Library rec-0.1: the first check is the contract's wording, the steps spell it out. */
const RECOMMENDATIONS: Record<RecommendationCode, { firstCheck: Text; steps: Record<Lang, string[]> }> = {
  HVAC_PERSISTENT_INCREASE: {
    firstCheck: { tr: 'Termostat ayarını ve kullanım değişikliğini kontrol edin', en: 'Check thermostat settings and usage changes' },
    steps: {
      tr: ['Termostat ayar noktasında veya programında değişiklik var mı bakın.', 'Hanede kullanım değişikliği olup olmadığını sorun.', 'Açıklama yoksa teknisyen incelemesi planlayın.'],
      en: ['Look for a change in the thermostat set point or schedule.', 'Ask whether usage in the household changed.', 'If there is no explanation, plan a technician inspection.'],
    },
  },
  DATA_SOURCE_CHECK: {
    firstCheck: { tr: 'Ölçüm ve veri kaynağını inceleyin', en: 'Inspect the measurement and data source' },
    steps: {
      tr: ['Ölçüm cihazının veri gönderdiğini doğrulayın.', 'Eksik veya yinelenen ölçüm aralıklarını kaynak sistemde kontrol edin.', 'Bu bir cihaz sinyali değildir; saha yönlendirmesinden önce veri sorununu giderin.'],
      en: ['Confirm that the measuring device is sending data.', 'Check the missing or repeated reading ranges in the source system.', 'This is not a device signal; fix the data issue before sending anyone on site.'],
    },
  },
};

const locale = (l: Lang) => (l === 'tr' ? 'tr-TR' : 'en-GB');
const num = (n: number, digits: number, l: Lang) =>
  new Intl.NumberFormat(locale(l), { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n);
/** Turkish writes the percent sign first (%14), English after (14%). */
const pct = (share: number, l: Lang) => (l === 'tr' ? `%${num(share * 100, 0, l)}` : `${num(share * 100, 0, l)}%`);
const day = (iso: string, l: Lang) =>
  new Intl.DateTimeFormat(locale(l), { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`));

function reasonText(reason: EvidenceReason, l: Lang): string {
  const tr = l === 'tr';
  const v = reason.value;
  if (v === null) return tr ? `${reason.code}: hesaplanmadı.` : `${reason.code}: not computed.`;
  switch (reason.code) {
    case 'DAILY_EXCESS_Z':
      return tr ? `En yüksek günlük z değeri ${num(v, 2, l)} (Haziran günlerine göre ölçeklenmiş).` : `The largest daily z is ${num(v, 2, l)} (scaled with June days).`;
    case 'UPPER_BOUND_EXCEEDANCE':
      return tr ? `İşaretli günlerde geçerli ölçümlerin ${pct(v, l)} kadarı kalibre üst sınırın üzerinde.` : `On the flagged days ${pct(v, l)} of valid readings lie above the calibrated upper bound.`;
    case 'CONSECUTIVE_FLAGGED_DAYS':
      return tr ? `Art arda işaretlenen gün sayısı: ${num(v, 0, l)}.` : `Consecutive flagged days: ${num(v, 0, l)}.`;
    case 'PERSISTENT_CUSUM':
      return tr ? `Kronik istatistik (CUSUM) en fazla ${num(v, 2, l)} değerine ulaştı.` : `The chronic statistic (CUSUM) reached ${num(v, 2, l)}.`;
    case 'EXCESS_OVER_REFERENCE':
      return tr ? `İşaretli günlerde ölçülen toplam, model referansının ${pct(v, l)} üzerinde.` : `Over the flagged days the measured total is ${pct(v, l)} above the model reference.`;
    case 'DAYS_NOT_SCORED':
      return tr ? `Vaka penceresinde ${num(v, 0, l)} gün değerlendirilemedi; bu günler ne işaretli ne temiz sayılır.` : `${num(v, 0, l)} days in the case window could not be scored; they count neither as flagged nor as clean.`;
    case 'MISSING_READINGS':
      return tr ? `Beklenen ölçümlerin ${pct(v, l)} kadarı eksik veya geçersiz.` : `${pct(v, l)} of the expected readings are missing or invalid.`;
    case 'FROZEN_READINGS':
      return tr ? `${num(v, 0, l)} ölçüm, aynı değeri yineleyen donma şüpheli serilerde.` : `${num(v, 0, l)} readings sit in suspected freeze runs that repeat one value.`;
  }
}

function summaryText(e: EvidenceCase, l: Lang): string {
  const tr = l === 'tr';
  const span = `${day(e.onset_local_date, l)} – ${day(e.last_local_date, l)}`;
  const prefix = e.origin === 'synthetic'
    ? (tr ? 'Sentetik deney: bu vaka, Temmuz verisine enjekte edilmiş bir senaryodan gelir. ' : 'Synthetic experiment: this case comes from a scenario injected into July data. ')
    : '';
  if (e.kind === 'data_issue') {
    return prefix + (tr
      ? `Hane ${e.household_id}, air1 kanalı: ${span} arasında ${e.flagged_days} gün veri kalitesi nedeniyle değerlendirilemedi. Bu bir cihaz sinyali değil, ölçüm veya veri kaynağı sorunudur.`
      : `Household ${e.household_id}, air1 channel: ${e.flagged_days} days between ${span} could not be scored because of data quality. This is a measurement or data-source issue, not a device signal.`);
  }
  const excess = e.excess_share === null
    ? ''
    : (tr ? ` Bu günlerde ölçülen değer model referansının ${pct(e.excess_share, l)} üzerinde.` : ` On those days the measured value is ${pct(e.excess_share, l)} above the model reference.`);
  return prefix + (tr
    ? `Hane ${e.household_id}, air1 kanalı: ${span} arasında ${e.flagged_days} gün günlük sapma koşulunu sağladı.${excess}`
    : `Household ${e.household_id}, air1 channel: ${e.flagged_days} days between ${span} met the daily deviation condition.${excess}`);
}

function limitations(e: EvidenceCase, l: Lang): string[] {
  const tr = l === 'tr';
  const list = [
    tr ? 'Değerler doğrulanmamış kaynak birimindedir; enerji veya para karşılığı hesaplanmaz.' : 'Values are in an unverified source unit; no energy or money figure is derived.',
    tr ? 'Yalnız Temmuz 2018 yeniden oynatma penceresi değerlendirildi.' : 'Only the July 2018 replay window was evaluated.',
  ];
  if (e.origin === 'synthetic') list.push(tr ? 'Sentetik vaka gerçek vaka sayılarına girmez.' : 'A synthetic case never enters real-case counts.');
  return list;
}

const FORBIDDEN = [/\bkwh?\b/i, /arıza doğrulandı/i, /kesin arıza/i, /fault confirmed/i, /tasarruf/i, /\bsavings?\b/i, /olasılı[kğ]/i, /\b(probability|likelihood)\b/i];

/** Every digit run in a value the evidence itself carries: the only numbers a text may contain. */
function evidenceNumbers(e: EvidenceCase): Set<string> {
  const allowed = new Set<string>(['2018', String(e.household_id), String(e.flagged_days)]);
  const add = (text: string) => { for (const token of text.match(/\d+/g) ?? []) allowed.add(token); };
  for (const iso of [e.onset_local_date, e.last_local_date]) add(String(Number(iso.slice(8))));
  for (const value of [e.excess_share, ...e.reasons.map((r) => r.value)]) {
    if (value === null) continue;
    add(num(value, 2, 'en'));
    add(num(value * 100, 0, 'en'));
  }
  return allowed;
}

/** Wording and number checks for any provider's text; an empty list means the text may be shown. */
export function guardViolations(texts: string[], humanDecisionNote: string, e: EvidenceCase, l: Lang): string[] {
  const violations: string[] = [];
  const allowed = evidenceNumbers(e);
  for (const text of texts) {
    for (const pattern of FORBIDDEN) if (pattern.test(text)) violations.push(`forbidden_wording: ${pattern.source}`);
    // "air1" and "2018" are names, not measurements.
    for (const token of text.replace(/air1/g, '').match(/\d+/g) ?? []) {
      if (!allowed.has(token)) violations.push(`number_not_in_evidence: ${token}`);
    }
  }
  if (humanDecisionNote !== HUMAN_DECISION[l]) violations.push('human_decision_note_missing');
  return violations;
}

/** The smallest text that is always safe: codes and the human-decision sentence. */
function fallback(e: EvidenceCase, l: Lang, violations: string[]): Explanation {
  return {
    provider: 'template',
    summary: l === 'tr' ? `Hane ${e.household_id}, air1 kanalı: model referansından sapma.` : `Household ${e.household_id}, air1 channel: deviation from the model reference.`,
    reasons: e.reasons.map((r) => r.code),
    recommendation: { firstCheck: RECOMMENDATIONS[e.recommendation.code].firstCheck[l], steps: [] },
    limitations: limitations(e, l),
    humanDecisionNote: HUMAN_DECISION[l],
    guard: { passed: false, violations },
  };
}

export function explainCase(evidence: EvidenceCase, lang: Lang): Explanation {
  const recommendation = RECOMMENDATIONS[evidence.recommendation.code];
  const explanation: Explanation = {
    provider: 'template',
    summary: summaryText(evidence, lang),
    reasons: evidence.reasons.map((reason) => reasonText(reason, lang)),
    recommendation: { firstCheck: recommendation.firstCheck[lang], steps: recommendation.steps[lang] },
    limitations: limitations(evidence, lang),
    humanDecisionNote: HUMAN_DECISION[lang],
    guard: { passed: true, violations: [] },
  };
  const violations = guardViolations([explanation.summary, ...explanation.reasons], explanation.humanDecisionNote, evidence, lang);
  return violations.length ? fallback(evidence, lang, violations) : explanation;
}

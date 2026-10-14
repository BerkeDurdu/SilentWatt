// Case explanations from structured evidence (contract: docs/architecture/evidence-contract.md).
//
// Template provider: every sentence is built from fields of the evidence, then checked by a guard
// (no forbidden wording, every number comes from the evidence, the human-decision sentence is there).
// An LLM provider can be plugged in behind the same interface; a failed guard falls back to the template.

import type { EvidenceCase, EvidenceFamily, EvidenceReason, RecommendationCode } from '../../shared/evidence';
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

/** Library rec-0.2: the first check is the contract's wording, the steps spell it out. */
const RECOMMENDATIONS: Record<RecommendationCode, { firstCheck: Text; steps: Record<Lang, string[]> }> = {
  HVAC_PERSISTENT_INCREASE: {
    firstCheck: { tr: 'Termostat ayarını ve kullanım değişikliğini kontrol edin', en: 'Check thermostat settings and usage changes' },
    steps: {
      tr: ['Termostat ayar noktasında veya programında değişiklik var mı bakın.', 'Hanede kullanım değişikliği olup olmadığını sorun.', 'Açıklama yoksa teknisyen incelemesi planlayın.'],
      en: ['Look for a change in the thermostat set point or schedule.', 'Ask whether usage in the household changed.', 'If there is no explanation, plan a technician inspection.'],
    },
  },
  REFRIGERATOR_PERSISTENT_INCREASE: {
    firstCheck: { tr: 'Kapı contasını, ayarı ve arka bobini kontrol edin', en: 'Check the door seal, the setting and the rear coil' },
    steps: {
      tr: ['Kapının tam kapandığını ve contanın sağlam olduğunu kontrol edin.', 'Termostat ayarının ve dolabın yerinin değişip değişmediğini sorun.', 'Arka bobin tozlu ya da hava alamıyorsa temizlenmesini önerin; açıklama yoksa servis planlayın.'],
      en: ['Check that the door closes fully and the seal is intact.', 'Ask whether the setting or the location of the fridge changed.', 'If the rear coil is dusty or blocked, suggest cleaning it; if nothing explains it, plan a service visit.'],
    },
  },
  SOLAR_PRODUCTION_SHORTFALL: {
    firstCheck: { tr: 'Panellerde gölge ve kirliliği, invertör uyarılarını kontrol edin', en: 'Check the panels for shade and soiling, and the inverter for alerts' },
    steps: {
      tr: ['Panellerin önünde yeni bir gölge (ağaç, yapı) ya da kirlilik var mı bakın.', 'İnvertör ekranında hata kaydı veya kapanmış dizi olup olmadığını kontrol edin.', 'Açıklama yoksa dizi bağlantıları için teknisyen incelemesi planlayın.'],
      en: ['Look for new shade (trees, buildings) or soiling in front of the panels.', 'Check the inverter display for error logs or a string that is off.', 'If nothing explains it, plan a technician inspection of the string connections.'],
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

/** How each family is named in a sentence. */
const SUBJECT: Record<EvidenceFamily, Text> = {
  hvac: { tr: 'klima devresi (air1)', en: 'air-conditioning circuit (air1)' },
  refrigeration: { tr: 'buzdolabı devresi', en: 'refrigerator circuit' },
  solar: { tr: 'güneş paneli üretimi', en: 'solar production' },
};
/** What the reference of each family is built from, in plain words. */
const REFERENCE_FROM: Record<EvidenceFamily, Text> = {
  hvac: { tr: 'Referans, aynı dış sıcaklık ve saatte beklenen tüketimdir.', en: 'The reference is the consumption expected at the same outdoor temperature and hour.' },
  refrigeration: { tr: 'Referans, buzdolabının Haziran’daki kendi haftalık çalışma profilidir.', en: 'The reference is the refrigerator’s own weekly profile in June.' },
  solar: { tr: 'Referans, açık gök ışınımı ve panel kapasitesinden beklenen üretimdir.', en: 'The reference is the production expected from clear-sky irradiance and panel capacity.' },
};

function reasonText(reason: EvidenceReason, l: Lang): string {
  const tr = l === 'tr';
  const v = reason.value;
  if (v === null) return tr ? `${reason.code}: hesaplanmadı.` : `${reason.code}: not computed.`;
  switch (reason.code) {
    case 'DAILY_EXCESS_Z':
      return tr ? `En yüksek günlük z değeri ${num(v, 2, l)} (Haziran günlerine göre ölçeklenmiş).` : `The largest daily z is ${num(v, 2, l)} (scaled with June days).`;
    case 'LOWER_BOUND_SHORTFALL':
      return tr ? `İşaretli günlerde geçerli ölçümlerin ${pct(v, l)} kadarı kalibre alt sınırın altında.` : `On the flagged days ${pct(v, l)} of valid readings lie below the calibrated lower bound.`;
    case 'SHORTFALL_BELOW_REFERENCE':
      return tr ? `İşaretli günlerde ölçülen üretim, model referansının ${pct(Math.abs(v), l)} altında.` : `Over the flagged days measured production is ${pct(Math.abs(v), l)} below the model reference.`;
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
  const subject = SUBJECT[e.family][l];
  const who = tr ? `Hane ${e.household_id}, ${subject}` : `Household ${e.household_id}, ${subject}`;
  const prefix = e.origin === 'synthetic'
    ? (tr ? 'Doğrulama senaryosu: bu vaka, Temmuz verisine bilerek eklenmiş bir senaryodan gelir. ' : 'Validation scenario: this case comes from a scenario deliberately injected into July data. ')
    : '';
  if (e.kind === 'data_issue') {
    return prefix + (tr
      ? `${who}: ${span} arasında ${e.flagged_days} gün veri kalitesi nedeniyle değerlendirilemedi. Bu bir cihaz sinyali değil, ölçüm veya veri kaynağı sorunudur.`
      : `${who}: ${e.flagged_days} days between ${span} could not be scored because of data quality. This is a measurement or data-source issue, not a device signal.`);
  }
  const share = e.excess_share;
  const measured = share === null
    ? ''
    : e.kind === 'production_shortfall'
      ? (tr ? ` Bu günlerde ölçülen üretim model referansının ${pct(Math.abs(share), l)} altında.` : ` On those days measured production is ${pct(Math.abs(share), l)} below the model reference.`)
      : (tr ? ` Bu günlerde ölçülen değer model referansının ${pct(share, l)} üzerinde.` : ` On those days the measured value is ${pct(share, l)} above the model reference.`);
  return prefix + (tr
    ? `${who}: ${span} arasında ${e.flagged_days} gün günlük sapma koşulunu sağladı.${measured} ${REFERENCE_FROM[e.family][l]}`
    : `${who}: ${e.flagged_days} days between ${span} met the daily deviation condition.${measured} ${REFERENCE_FROM[e.family][l]}`);
}

function limitations(e: EvidenceCase, l: Lang): string[] {
  const tr = l === 'tr';
  const list = [
    tr ? 'Değerler doğrulanmamış kaynak birimindedir; enerji veya para karşılığı hesaplanmaz.' : 'Values are in an unverified source unit; no energy or money figure is derived.',
    tr ? 'Yalnız Temmuz 2018 yeniden oynatma penceresi değerlendirildi.' : 'Only the July 2018 replay window was evaluated.',
  ];
  if (e.origin === 'synthetic') list.push(tr ? 'Doğrulama senaryosu gerçek vaka sayılarına girmez.' : 'A validation scenario never enters real-case counts.');
  list.push(tr ? 'Bilinen bir değişiklik (yeni cihaz, onarım, kullanım) varsa bildirilmelidir; referans o tarihten yeniden öğrenilir.' : 'A known change (new device, repair, usage) should be reported; the reference is then re-learned from that date.');
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
    add(num(Math.abs(value), 2, 'en'));
    add(num(Math.abs(value) * 100, 0, 'en'));
  }
  return allowed;
}

/** Wording and number checks for any provider's text; an empty list means the text may be shown. */
export function guardViolations(texts: string[], humanDecisionNote: string, e: EvidenceCase, l: Lang): string[] {
  const violations: string[] = [];
  const allowed = evidenceNumbers(e);
  for (const text of texts) {
    for (const pattern of FORBIDDEN) if (pattern.test(text)) violations.push(`forbidden_wording: ${pattern.source}`);
    // Circuit names such as "air1" are names, not measurements.
    for (const token of text.replace(/\b(air1|furnace1|refrigerator1)\b/g, '').match(/\d+/g) ?? []) {
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
    summary: l === 'tr' ? `Hane ${e.household_id}, ${SUBJECT[e.family].tr}: model referansından sapma.` : `Household ${e.household_id}, ${SUBJECT[e.family].en}: deviation from the model reference.`,
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

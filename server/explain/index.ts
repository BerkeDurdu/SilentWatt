// Case explanations from structured evidence (contract: docs/architecture/evidence-contract.md).
//
// This file fixes the interface the API calls. The explanation agent replaces the body with
// the full template library and guard; the signature and the Explanation shape stay as they are.

import type { EvidenceCase } from '../../shared/evidence';
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

export function explainCase(evidence: EvidenceCase, lang: Lang): Explanation {
  const tr = lang === 'tr';
  const summary = tr
    ? `Hane ${evidence.household_id} için ${evidence.onset_local_date} tarihinden itibaren air1 kanalında model referansından sapma görüldü.`
    : `From ${evidence.onset_local_date}, the air1 channel of household ${evidence.household_id} deviates from the model reference.`;
  return {
    provider: 'template',
    summary,
    reasons: evidence.reasons.map((reason) => `${reason.code}: ${reason.value ?? '—'}`),
    recommendation: { firstCheck: evidence.recommendation.code, steps: [] },
    limitations: [tr ? 'Değerler doğrulanmamış kaynak birimindedir.' : 'Values are in an unverified source unit.'],
    humanDecisionNote: tr
      ? 'Bu bir inceleme önerisidir; kararı ekip verir.'
      : 'This is an inspection recommendation; the team decides.',
    guard: { passed: true, violations: [] },
  };
}

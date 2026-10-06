# P1 — frozen development protocol

Status: conditional offline experiment, not G0/production approval. P0 was rechecked
before implementation; its incorrect HTML success count was corrected. Source
units, interval semantics and `air1` mapping remain open in the P0 decision log. The
negative policy and the cohort were decided on 2026-10-06 and define p1-v2 (see the
section at the end). Source values and cohort/split thresholds stay unchanged.

## Predeclared protocol

- Cohort: recompute existing train-only rules; never choose households by development
  performance. Existing Austin candidates are expected to remain eight (p1-v1;
  21 under the p1-v2 dead band).
- B0: existing empirical temperature/hour quantiles and fallbacks. B1: per-household
  `HistGradientBoostingRegressor(loss="quantile")`, q05/q50/q95, 100 iterations,
  learning rate 0.1, 15 leaves, minimum leaf size 20, seed 42. Early stopping is
  disabled so sklearn does not introduce a shuffled validation split.
- Both use the same quality-accepted training slots and feature information
  (temperature and local hour); no target lags, inferred health labels or fitted
  transforms. B0's existing standalone command is preserved.
- Clip raw quantiles to nonnegative values and sort them before calibration and
  evaluation. CQR scores come exclusively from calibration (June), using
  `ceil((n+1)*(1-alpha))`, alpha 0.1, qhat floored at zero. At least 14 accepted
  local days and 1,000 valid supported slots are required; otherwise
  `calibration_pending` with null calibrated bounds. No cross-household borrowing.
- Report calibration fit diagnostics separately; their in-sample coverage is not
  generalization evidence. July development alone compares B0/B1; no test API,
  test metrics, test-based tuning or final-test access flag in this command.
- Primary comparison uses identical development slots for the two models on
  accepted days. Report raw quantile pinball (q05/q50/q95 mean), MAE, raw/calibrated
  point coverage and width, counts and exclusions by household and month, plus
  pooled-slot and equal-household summaries. Never call point coverage an event
  recall or fault probability. CQR bounds are not the original fitted quantiles.
- B1 is recommended only if equal-household raw mean pinball improves, all
  candidate households have calibrated development metrics, calibrated pooled
  coverage is within the PRD's exploratory 0.87–0.93 band and mean calibrated
  width is at most 1.10 × B0. This is a development screening rule, not test
  acceptance or proof of statistical significance. Otherwise retain B0; missing calibration/daily support yields
  `insufficient_evidence`; publish all household differences, including regressions.

## Daily quality policy v1

- UTC grid mapped to complete local days; DST denominators are 92/96/100 slots.
  No interpolation. Missing rows, null target, negative target, nonfinite/invalid
  target and missing weather are counted separately. Invalid slots never score.
- Target+weather valid coverage must be at least 95% of expected daily slots.
  A day with any observed temperature outside the fitted training min/max is
  `out_of_support` and excluded from the primary daily-qualified analysis.
  Supported-slot diagnostic metrics remain available so exclusion effects are visible.
- Provisional freeze suspicion: 16 consecutive identical finite positive values
  (4 hours), exact equality at source precision. Zero/off runs are not freeze
  evidence. NaN/invalid values and timestamp gaps break a run. Only the 16th and
  subsequent slots are flagged (past-only); runs carry across local midnight but
  never use later values to retroactively change earlier splits. A day with a
  flagged slot is excluded. This is a conservative research gate, not confirmed
  sensor failure; metadata and B+C validation remain required.
- Fit B0/B1 on valid slots from accepted training days. Learn temperature support
  from those exact fitted rows; calibration/development never expand the range.
  Do not drop entire households from the published cohort if a profile is pending.

## Reproducibility and boundaries

Record complete config, input/code hashes, dependency versions, feature order,
parameters/seed, cohort manifest, calibration counts/qhat, and artifact hashes.
Use a fresh output directory; never overwrite sources. Synthetic tests cover
future-target invariance, calibration isolation, rank edge cases, chronological
freeze flags, DST, empty groups and deterministic output. Large artifacts stay
outside Git; a compact development report is committed after the run.

## p1-v2 (2026-10-06)

p1-v2 keeps every rule above and adds two things. With `target_dead_band` set to 0,
a p1-v2 run reproduces the p1-v1 development run of 2026-09-17 (run03) exactly.

- **Target dead band (D-04, decided 2026-10-06).** Sensors rest at slightly different
  levels around zero while the unit is off (−0.001 in one household, +0.004 in
  another). Readings with |air1| ≤ `target_dead_band` (0.01) are the off state and
  read as 0; readings below −0.01 stay invalid (`negative_target`); the source is never
  changed. Daily quality reports `dead_band_slots`. Because the freeze rule follows
  positive values only, off-state readings can no longer start a freeze run. The
  cohort becomes 21 candidates instead of 8; the count follows from the rule and was
  not a target. Evidence: `docs/product/ekler/review_dead_band_cohort.py`.
- **Report metrics.** Every metric record also reports `upper_exceedance` and
  `lower_exceedance` (share of calibrated slots above the upper / below the lower
  bound) and `running_calibrated_coverage`, the coverage over slots with target above
  `p1.evaluation.running_threshold` (0.3, the air1-active level of the 2026-09-27
  HVAC review). Off slots that sit on a zero lower bound flatter the two-sided
  coverage, and a detector reads the upper side. The screening rule above is unchanged.

Development results: [P1 v2 report](../project-status/p1-v2-results-2026-10-06.md).

Method references: [CQR paper](https://papers.neurips.cc/paper/8613-conformalized-quantile-regression.pdf),
[sklearn HGB API](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.HistGradientBoostingRegressor.html).
Standard exchangeability coverage guarantees do not automatically apply to seasonal,
autocorrelated electricity data; empirical household/month coverage is essential.

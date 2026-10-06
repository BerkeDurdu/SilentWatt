# Evidence contract v0.1 (`silentwatt.evidence/0.1`)

ML (Role C) üretir; API ve konsol okur. Bu belge, MVP'de ML ile web arasındaki tek
sözleşmedir: dosya düzeni, alanlar, kodlar ve herkesin uyacağı sınırlar. Alan adları
İngilizce, kullanıcıya görünen metinler Türkçe ve İngilizce.

Owner: ML writes, API and console read. Changing a field needs a new `schema_version`
and a note in this file. TypeScript types: [`shared/evidence.ts`](../../shared/evidence.ts).
Fully synthetic fixtures for development and tests: [`shared/fixtures/evidence/`](../../shared/fixtures/evidence/).

## Rules every consumer follows

1. **Unit unverified.** Values are in the source unit (`source_unit_unverified`). Never
   label them kW or kWh, never derive money or savings. Daily sums are reported as
   *unit-hours* (`0.25 × sum of 15-minute values`) and shown as "kaynak birimi × saat" or,
   preferably, as a share of the model reference.
2. **No fault probabilities, no diagnosis.** Evidence carries measured deviations, reason
   codes and an inspection recommendation. Wording such as "arıza doğrulandı",
   "fault confirmed", "kesin arıza" or a percentage likelihood of a fault is not allowed.
3. **Synthetic cases stay labelled.** `origin: "synthetic"` cases come from injected
   scenarios on real July data. They carry a visible label everywhere, are counted
   separately from observed cases and never enter real-case statistics.
4. **Null is not zero.** A `null` value means "not computed or not valid". It is never
   drawn as 0 or averaged as 0.
5. **Replay window only.** All dates lie in the development window (July 2018, local
   time America/Chicago). Test-period dates never appear; a consumer that sees one rejects
   the file.
6. **Human decision.** The product recommends an inspection; people decide. The
   explanation always ends with that statement.

## Files

```text
<evidence_dir>/
  index.json            run information and one summary per case
  cases/<case_id>.json  the full evidence of one case
```

`<evidence_dir>` is configured by the API (`SILENTWATT_EVIDENCE_DIR`); without it the API
uses the fixtures. Real runs write to a fresh `artifacts/` directory and are never
committed.

## `index.json`

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | `"silentwatt.evidence/0.1"` | Contract version |
| `generated_at_utc` | ISO-8601 string | When the file was written |
| `fixture` | boolean | `true` only for the committed synthetic fixtures |
| `run` | object | See below |
| `evaluation` | object or `null` | Detection results on synthetic cases and clean data, see below |
| `cases` | array of case summaries | One entry per case, ordered by `rank` |

`run`:

| Field | Type | Meaning |
| --- | --- | --- |
| `run_id` | string | Identifier of the detector run |
| `source_run` | string | P1 run the predictions come from, e.g. `p1-2026-10-06/development-run03` |
| `dataset_id` | string | e.g. `pecan-austin-2018-v1` |
| `protocol_version` | string | P1 protocol, e.g. `p1-v2` |
| `model` | `"B0"` or `"B1"` | Model whose calibrated band the detector reads |
| `replay_window` | `{split, start_local_date, end_local_date}` | `development`, `2018-07-01`, `2018-08-01` (end exclusive) |
| `unit` | `"source_unit_unverified"` | Always this value in v0.1 |
| `households` | integer | Households replayed |
| `detector` | object | Detector version, thresholds and where the thresholds come from |
| `synthetic_plan` | object or `null` | Seed, generator version and scenario grid, when synthetic cases exist |

`run.detector`: `{version, acute: {z_threshold, exceedance_share_threshold, consecutive_days},
chronic: {k, h, positive_days, window_days}, data_issue: {consecutive_days},
threshold_provenance}`. `threshold_provenance` says how the thresholds were set, for
example `"prd-v1.1-initial"` or `"june-calibrated: <alarm budget>"`; the console shows it.

`evaluation` (optional): `{clean_household_days, false_cases_on_clean_data,
synthetic_cases, synthetic_detected, by_scenario: [{scenario, fault_kind, severity,
duration_days, injected, detected, median_delay_days}], data_faults_caught_by_quality_gate}`.
`median_delay_days` is `null` when nothing was detected.

## Case summary (in `index.json`) and case file

The case file repeats every summary field and adds the detail fields.

| Field | Type | Meaning |
| --- | --- | --- |
| `case_id` | string | Unique. Real: `SW-HVAC-0661-20180712-ACU`; synthetic: `SW-SYN-HVAC-0661-20180712-ACU` |
| `origin` | `"observed"` or `"synthetic"` | See rule 3 |
| `household_id` | integer | Dataport `dataid` (fixtures use made-up ids from 90001) |
| `family` | `"hvac"` | Equipment family; only HVAC in v0.1 |
| `circuit` | `"air1"` | Channel name |
| `kind` | `"consumption_deviation"` or `"data_issue"` | What the case is about |
| `detectors` | array of `"acute"`, `"chronic"`, `"data_quality"` | Paths that raised the case (merged when they overlap) |
| `onset_local_date` | date string | First flagged day |
| `detected_local_date` | date string | Day the rule was first met (e.g. the second consecutive day) |
| `last_local_date` | date string | Last flagged day in the window |
| `flagged_days` | integer | Days that met the daily condition |
| `excess_share` | number or `null` | `observed / reference − 1` over the valid slots of the flagged days; `null` for data issues or when the reference is below the floor |
| `upper_exceedance_share` | number or `null` | Share of valid slots above the calibrated upper bound on the flagged days |
| `rank` | integer | 1 = first in the list |
| `rank_basis` | string | `"excess_unit_hours_desc,flagged_days_desc,case_id_asc"`; data issues rank after deviations |
| `priority` | `1`, `2` or `3` | Thirds of the rank order among consumption deviations; data issues are `3` |
| `recommendation_code` | string | See code lists |

Detail fields (case file only):

| Field | Type | Meaning |
| --- | --- | --- |
| `schema_version` | string | Same as the index |
| `synthetic` | object or `null` | `{scenario, fault_kind, severity, duration_days, start_local_date, seed, generator_version}`; `null` for observed cases |
| `daily` | array of daily evidence | Every July day of the household, so the console can show the month |
| `series` | array of series points | 15-minute points from three days before onset to one day after the last flagged day, inside July |
| `reasons` | array of `{code, value}` | Why the case exists; texts come from the explanation library |
| `recommendation` | `{code, library_version}` | Inspection recommendation |

Daily evidence:

| Field | Type | Meaning |
| --- | --- | --- |
| `local_date` | date string | Local day |
| `scored` | boolean | The day passed the daily quality gate and has a calibrated band |
| `not_scored_reason` | string or `null` | `daily-quality.csv` reasons joined by `|`, e.g. `temperature_out_of_support` |
| `valid_slots`, `expected_slots` | integer | Slots used and slots of the day (92/96/100 on DST days) |
| `observed_unit_hours` | number or `null` | `0.25 × Σ observed` over valid slots |
| `reference_unit_hours` | number or `null` | `0.25 × Σ q50` over the same slots ("model referansı") |
| `excess_share` | number or `null` | `observed / reference − 1`; `null` below the reference floor |
| `upper_exceedance_share` | number or `null` | Share of valid slots above the upper bound |
| `z` | number or `null` | Robust daily z of the residual, scaled with June (calibration) days |
| `cusum` | number or `null` | Chronic statistic after this day |
| `flagged` | boolean | The day met the acute or chronic daily condition |
| `max_temperature_c` | number or `null` | Highest hourly temperature of the day |

Series point: `{ts_utc, observed, reference, lower, upper, temperature_c, scored}`.
`observed` is the value after the dead band (|air1| ≤ 0.01 reads 0); `reference` is q50;
`lower`/`upper` are the calibrated band. Any of them can be `null`.

## Code lists (v0.1)

Reason codes (`value` meaning in brackets):

| Code | Used for |
| --- | --- |
| `DAILY_EXCESS_Z` | largest daily z among flagged days |
| `UPPER_BOUND_EXCEEDANCE` | share of valid slots above the upper bound on flagged days |
| `CONSECUTIVE_FLAGGED_DAYS` | number of consecutive flagged days |
| `PERSISTENT_CUSUM` | largest chronic statistic |
| `EXCESS_OVER_REFERENCE` | excess share over the model reference |
| `DAYS_NOT_SCORED` | days in the case window that could not be scored |
| `MISSING_READINGS` | share of expected slots without a valid reading (data issue) |
| `FROZEN_READINGS` | slots in suspected freeze runs (data issue) |

Recommendation codes (library `rec-0.1`, PRD §9.2 rows that need only 15-minute data):

| Code | First check |
| --- | --- |
| `HVAC_PERSISTENT_INCREASE` | Check thermostat settings and usage changes; if there is no explanation, plan a technician inspection |
| `DATA_SOURCE_CHECK` | Inspect the measurement and data source; this is not a device signal |

Synthetic scenarios: `step_increase`, `ramp_increase`, `data_fault` with `fault_kind`
`outage`, `freeze` or `spike`. Severities and durations are recorded per case; the grid
and its sources are documented with the generator.

## Explanation interface (server)

`server/explain/index.ts` exports `explainCase(evidence: EvidenceCase, lang: Lang): Explanation`.
The default provider is a template that only uses fields of the evidence; an LLM provider can
be plugged in later behind the same interface. Every explanation passes a guard: no
forbidden wording (rule 1–2), every number comes from the evidence, and the human-decision
sentence is present. A failed guard falls back to the template.

## Versioning

v0.1 covers HVAC (`air1`) and the July replay. Adding a family, a reason code or a field
creates v0.2. Consumers reject an unknown major `schema_version` instead of guessing.

# Evidence contract v0.2 (`silentwatt.evidence/0.2`)

ML (Role C) üretir; API ve konsol okur. Bu belge, MVP'de ML ile web arasındaki tek
sözleşmedir: dosya düzeni, alanlar, kodlar ve herkesin uyacağı sınırlar. Alan adları
İngilizce, kullanıcıya görünen metinler Türkçe ve İngilizce.

Owner: ML writes, API and console read. Changing a field needs a new `schema_version`
and a note in this file. v0.2 adds device families (HVAC, refrigerator, solar), the
`production_shortfall` kind and the change notices the console sends back (see the end of this
file). v0.1 files are still read: the API treats them as one HVAC family on `air1`. TypeScript types: [`shared/evidence.ts`](../../shared/evidence.ts).
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
   scenarios on real July data. They carry a visible label everywhere ("Doğrulama senaryosu" /
   "validation scenario": with about 20 households and no field-verified faults, they are how
   the method is measured), are counted separately from observed cases and never enter
   real-case statistics.
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

## Device families (v0.2)

Only devices whose expected behaviour can be predicted are fault targets. Usage-driven devices
(dishwasher, washing machine, dryer, EV) are context: their deviation means "used more", not a fault.

| `family` | `circuit` | Reference built from (`expected_from`) | Kind of case | Recommendation |
| --- | --- | --- | --- | --- |
| `hvac` | `air1` | `outdoor_temperature,hour` | `consumption_deviation` | `HVAC_PERSISTENT_INCREASE` |
| `refrigeration` | `refrigerator1` | `own_june_profile,hour_of_week` | `consumption_deviation` | `REFRIGERATOR_PERSISTENT_INCREASE` |
| `solar` | `solar` | `clear_sky_irradiance,capacity` | `production_shortfall` | `SOLAR_PRODUCTION_SHORTFALL` |

The table shows the fixtures' codes. The detector run (`silentwatt-ml detect`) writes what it actually
built: `outdoor_temperature,hour,june_level,peers` for HVAC and refrigeration (temperature × hour model,
scaled to the device's June level and to the same day's common shift of the other households) and
`neighbour_systems,capacity,june_level` for solar (capacity × median normalised production of the other
systems at the same slot). The console labels every code; an unknown code is shown as written.
See [the run report](../project-status/detector-run-2026-10-14.md).

Any family can also have `data_issue` cases (`DATA_SOURCE_CHECK`). `furnace1` is reserved for
the HVAC family once the indoor fan is modelled. Every family keeps the same chain: expected
behaviour → calibrated band → persistent deviation → evidence → human decision.

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
| `households` | integer | Households replayed (all families) |
| `families` | array | v0.2: `{family, circuit, households, expected_from, threshold_provenance}` per modelled family; `threshold_provenance` is `null` when the run-wide one applies |
| `detector` | object | Detector version, thresholds and where the thresholds come from |
| `synthetic_plan` | object or `null` | Seed, generator version and scenario grid, when synthetic cases exist |

`run.detector`: `{version, acute: {z_threshold, exceedance_share_threshold, consecutive_days},
chronic: {k, h, positive_days, window_days}, data_issue: {consecutive_days},
threshold_provenance}`. `threshold_provenance` says how the thresholds were set, for
example `"prd-v1.1-initial"` or `"june-calibrated: <alarm budget>"`; the console shows it.

`evaluation` (optional): `{clean_household_days, false_cases_on_clean_data,
synthetic_cases, synthetic_detected, by_scenario: [{family, scenario, fault_kind, severity,
duration_days, injected, detected, median_delay_days}], data_faults_caught_by_quality_gate}`.
`family` in `by_scenario` and in `synthetic_plan.scenarios` is new in v0.2.
`median_delay_days` is `null` when nothing was detected.

## Case summary (in `index.json`) and case file

The case file repeats every summary field and adds the detail fields.

| Field | Type | Meaning |
| --- | --- | --- |
| `case_id` | string | Unique. `SW-<HVAC\|REF\|SOL>-<household>-<onset>-<detectors>`, e.g. `SW-HVAC-0661-20180712-ACU`; synthetic: `SW-SYN-HVAC-0661-20180712-ACU` |
| `origin` | `"observed"` or `"synthetic"` | See rule 3 |
| `household_id` | integer | Dataport `dataid` (fixtures use made-up ids from 90001) |
| `family` | `"hvac"`, `"refrigeration"`, `"solar"` | Device family (table above) |
| `circuit` | `"air1"`, `"refrigerator1"`, `"solar"` | Channel name |
| `kind` | `"consumption_deviation"`, `"production_shortfall"` or `"data_issue"` | What the case is about |
| `detectors` | array of `"acute"`, `"chronic"`, `"data_quality"` | Paths that raised the case (merged when they overlap) |
| `onset_local_date` | date string | First flagged day |
| `detected_local_date` | date string | Day the rule was first met (e.g. the second consecutive day) |
| `last_local_date` | date string | Last flagged day in the window |
| `flagged_days` | integer | Days that met the daily condition |
| `excess_share` | number or `null` | `observed / reference − 1` over the valid slots of the flagged days (negative for a production shortfall); `null` for data issues or when the reference is below the floor |
| `upper_exceedance_share` | number or `null` | Share of valid slots above the calibrated upper bound on the flagged days; `null` for a production shortfall |
| `lower_shortfall_share` | number or `null` | v0.2: share of valid slots below the calibrated lower bound on the flagged days (production shortfall) |
| `rank` | integer | 1 = first in the list |
| `rank_basis` | string | `"abs_deviation_unit_hours_desc,flagged_days_desc,case_id_asc"` (v0.1: `excess_unit_hours_desc,…`); data issues rank after deviations |
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
| `lower_shortfall_share` | number or `null` | v0.2, optional: share of valid slots below the lower bound |
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
| `LOWER_BOUND_SHORTFALL` | v0.2: share of valid slots below the lower bound on flagged days |
| `CONSECUTIVE_FLAGGED_DAYS` | number of consecutive flagged days |
| `PERSISTENT_CUSUM` | largest chronic statistic |
| `EXCESS_OVER_REFERENCE` | excess share over the model reference |
| `SHORTFALL_BELOW_REFERENCE` | v0.2: share below the model reference (negative), production shortfall |
| `DAYS_NOT_SCORED` | days in the case window that could not be scored |
| `MISSING_READINGS` | share of expected slots without a valid reading (data issue) |
| `FROZEN_READINGS` | slots in suspected freeze runs (data issue) |

Recommendation codes (library `rec-0.2`, PRD §9.2 rows that need only 15-minute data):

| Code | First check |
| --- | --- |
| `HVAC_PERSISTENT_INCREASE` | Check thermostat settings and usage changes; if there is no explanation, plan a technician inspection |
| `REFRIGERATOR_PERSISTENT_INCREASE` | Check the door seal, the setting and the rear coil; if there is no explanation, plan a service visit |
| `SOLAR_PRODUCTION_SHORTFALL` | Check the panels for shade and soiling and the inverter for alerts; if there is no explanation, inspect the strings |
| `DATA_SOURCE_CHECK` | Inspect the measurement and data source; this is not a device signal |

Synthetic scenarios: `step_increase`, `ramp_increase`, `production_drop` (solar, v0.2),
`data_fault` with `fault_kind` `outage`, `freeze` or `spike`. Severities and durations are recorded per case; the grid
and its sources are documented with the generator.

## Explanation interface (server)

`server/explain/index.ts` exports `explainCase(evidence: EvidenceCase, lang: Lang): Explanation`.
The default provider is a template that only uses fields of the evidence; an LLM provider can
be plugged in later behind the same interface. Every explanation passes a guard: no
forbidden wording (rule 1–2), every number comes from the evidence, and the human-decision
sentence is present. A failed guard falls back to the template.

## Console → ML: change notices (v0.2)

A deviation is often explained by something the household knows and the model cannot: a new air
conditioner, a repaired refrigerator, guests for a week. The resident can say so on the request
page, and an operator can close a case as "explained by a reported change". The API exports
every notice:

`GET /api/v1/changes` → `{schema_version: "silentwatt.changes/0.1", changes: [...]}`

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Stable per household, circuit, day and source |
| `household_id` | integer | Dataport `dataid` |
| `family`, `circuit` | string or `null` | The device; `null` means the whole household |
| `kind` | `new_device`, `repair`, `usage_change`, `other` | What changed |
| `local_date` | date string | Day the change took effect (household local time). A resident cannot date it against the replay, so their notices use the case onset |
| `source` | `resident` or `operator` | Who reported it; a resident notice does not close the case, an operator decides |
| `case_id` | string or `null` | Case the notice was given on |
| `note` | string or `null` | Free text |
| `recorded_at_utc` | ISO-8601 string | When it was recorded |

The next detector run re-learns the reference of that household and circuit from `local_date`
and raises no new case while the reference is re-learned (the period is a detector setting).

## Versioning

v0.1 covered HVAC (`air1`) and the July replay. v0.2 adds families, `production_shortfall`,
`lower_shortfall_share`, two reason codes, two recommendation codes and the change notices; v0.1
files stay readable. Consumers reject an unknown major `schema_version` instead of guessing.

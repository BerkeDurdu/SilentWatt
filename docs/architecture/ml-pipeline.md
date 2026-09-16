# ML pipeline boundary

Owner: Yusuf Ziya Demirel (Role C). Muharrem Dokgöz (Role B) owns orchestration and API integration. Berke Durdu (Role A) owns presentation and user interaction.

```text
immutable CSV sources
        |
        v
dataset audit + cohort manifest
        |
        v
leakage-safe feature table
        |
        +--> empirical quantile baseline
        |       |
        |       v
        |   baseline metrics
        |
        +--> quantile candidate + calibration      [next milestone]
                    |
                    v
            acute/chronic detection                [next milestone]
                    |
                    v
             versioned evidence JSON
                    |
                    v
              Express API and UI
```

The first executable milestone is the source audit and one-household baseline. It answers four questions before model complexity grows:

1. Can the source files be parsed deterministically?
2. Which households have adequate `air1` coverage under the declared rules?
3. Can a simple temperature/hour baseline produce reproducible development metrics?
4. Which data and unit assumptions remain unverified?

## Contract with the backend

Role C writes versioned artifacts. Role B reads them and persists user-facing cases. Role C never writes directly into the application database.

Today only offline audit and baseline files exist. `shared/types.ts` is the current TypeScript demo contract, not the analytical evidence schema. Do not map empirical quantiles or anomaly scores into demo fault probabilities or kWh savings. Role B will own the versioned API contract, with C defining evidence/status semantics and A consuming the same fixtures.

The existing Express API remains in `server/`; a second FastAPI service is not required for this foundation. PostgreSQL, object storage and cloud batch jobs are future Role B deliveries. Local file paths remain configurable so the ML code does not depend on Google Cloud or Huawei SDKs.

Role B and C jointly own the handoff from source parsing to canonical features: the current reusable implementation is `silentwatt_ml.data`. A later ingestion package must extract these rules with regression tests rather than create a second parser. `apps/` and `services/` directories will be introduced only if an actual service split needs them.

The future evidence JSON must include dataset, config, model, calibration, detector and code versions. Missing or out-of-support predictions carry reason codes instead of numeric zeroes. Synthetic namespaces never enter the real case queue without a visible label.

## Definition of done for the foundation

- `audit` scans the three required source paths without mutating them.
- Candidate selection is deterministic and reports its reasons.
- `baseline` fits training rows only, evaluates development by default, and requires explicit opt-in for test.
- Unit tests run without raw data.
- Large data and artifacts are ignored by Git.
- CI verifies the TypeScript build and Python unit tests.

The audit covers full-file exact timestamp-key duplication at both resolutions. Only 15-minute target/training coverage selects candidates. One-minute cycle features, cross-resolution validation and daily quality gates remain separate milestones. Electricity timestamps use explicit source offsets; Open-Meteo requires UTC/GMT metadata. Hourly weather is joined within the same UTC hour without forward/back filling. Provider interval semantics remain unverified.

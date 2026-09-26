# SilentWatt Agent Guidelines

## Session Start

- Read `second_brain/home.md` first: current state, active blockers and the reading map.
- For work that touches data or ML decisions, also read `second_brain/decisions.md`.

## Project Invariants

These hold unless the project owner or the team decides otherwise. Open items and their status are tracked in `second_brain/decisions.md`.

- The test split (local dates 2018-08-01 to 2019-01-01) is closed: its targets never enter cleaning, feature tables, training, calibration, metrics or model selection. Household 661's test metrics were exposed on 2026-09-16 and stay exploratory; runs marked "test seen" in `second_brain/ml/experiment-log.md` are never used for decisions or tuning.
- Split roles: train fits and selects, June calibrates, July (development) compares. Thresholds and the cohort are never chosen to reach a target household count or to improve a result.
- Electricity values are `source_unit_unverified`: no kW/kWh, savings or "fault confirmed" wording. `air1` is a channel name; the product language is "air1 channel deviation".
- Source CSVs under `../dataset/` are read-only, every run writes to a fresh `artifacts/` directory, and neither raw data nor artifacts are committed.
- Config thresholds and data transformations do not change without a team decision. Generic skill advice (imputation, clipping, arbitrary de-duplication, DQS scores) is not applied here.
- Open data decisions (D-01…D-05, Q-01) are not closed by an assumption written into code.

## Workflow

### 1. Plan Before Non-Trivial Work

- Write a plan before architectural decisions, ML/data decisions, or tasks involving multiple meaningful steps; use plan mode when available.
- Keep simple, low-risk changes direct.
- If assumptions fail or the implementation diverges from the plan, stop and re-plan.
- Include verification in the plan, not only implementation.

### 2. Use the Project Skills Deliberately

- The project skills live in `.claude/skills/`. That README lists each skill, when it applies, and the project constraints that override its upstream examples; read those constraints before following an example.
- Skill scaffolds are not validated pipeline tools: the `senior-data-scientist` and `senior-ml-engineer` scripts report success without doing the work.
- The `ponytail` family kept under `.codex/skills/` is not used; this project prefers readable, explainable code over minimal code.
- Use subagents only when work can be meaningfully isolated or parallelized.
- Keep each subagent focused on one well-defined responsibility.

### 3. Preserve Scope

- Do not expand the requested task without a concrete technical reason.
- Prefer minimal, targeted changes over broad refactors.
- Do not silently change product, dataset, cohort, threshold, or ML assumptions.
- Surface consequential decisions explicitly.

### 4. Verify Before Done

- Never mark work complete without evidence that it works.
- Run the relevant tests, checks, builds, or data validations.
- For ML/data changes, check for leakage, reproducibility, and invalid assumptions.
- Compare behavior before and after the change when relevant.
- Report failed or unavailable verification honestly.

### 5. Engineering Quality

- Prioritize: correctness → readability → simplicity → minimal impact → elegance.
- Write code the project owner can follow and explain in a technical presentation: descriptive names that use the domain terms in `second_brain/glossary.md`, explicit steps instead of compressed one-liners, and short comments that explain *why* for non-obvious domain logic (DST denominators, calibration ranks, freeze runs).
- Keep the call flow easy to trace: do not add layers or helpers only to make code shorter, and do not merge distinct steps to save lines.
- Code written before these rules is not refactored on its own. When a task changes an existing function, first bring that function to this standard in a separate behavior-preserving commit (tests pass, outputs unchanged), then make the functional change. Untouched code stays as it is.
- After a code change, explain what changed, why, how the new code works step by step, and how it was verified.
- Fix root causes rather than masking symptoms.
- Avoid temporary fixes unless explicitly justified and documented.
- Do not introduce unnecessary abstractions or dependencies.

### 6. Autonomous Problem Solving

- Investigate bugs using logs, failing tests, code, and available evidence.
- Fix issues autonomously when the requested scope and evidence are sufficient.
- Ask the user only when a decision cannot be safely derived from the repository or when the action is consequential or destructive.

## Task Management

For substantial tasks:

1. Record the plan in `tasks/todo.md`.
2. Track meaningful progress as work proceeds.
3. Add a short verification/review section when complete.
4. Update `tasks/lessons.md` only when a correction reveals a durable project-level lesson likely to prevent future mistakes.

## Core Principles

- Do not invent missing facts.
- Distinguish verified facts, assumptions, and open decisions.
- Preserve reproducibility.
- Keep changes scoped and reviewable.
- Existing working behavior should not be changed without a reason.

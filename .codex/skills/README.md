# SilentWatt project skills

This directory contains a small, committed set of Codex skills selected for SilentWatt. The full upstream repositories are intentionally not vendored.

## Selected skills

| Skill | Use in this project |
| --- | --- |
| `ponytail` | Keep implementation choices small and avoid speculative abstractions. Use as the primary skill whenever writing or changing code. |
| `ponytail-review`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help` | Focused companion checks for over-engineering and deliberate shortcuts. |
| `diagram-design` | Produce architecture, data-flow, deployment and evaluation diagrams as standalone HTML/SVG/PNG. |
| `data-quality-auditor` | Inspect dataset completeness, validity and consistency before modeling. |
| `senior-data-scientist` | Design and evaluate statistical/ML experiments and model comparisons. |
| `senior-ml-engineer` | Review productionization, model packaging, monitoring and MLOps boundaries. |
| `senior-architect` | Review system boundaries and architecture decisions. |
| `code-reviewer` | Perform correctness and maintainability reviews. |
| `tdd-guide` | Guide red–green–refactor work and test coverage. |
| `dependency-auditor` | Review npm/Python dependencies, upgrade risks and licenses. |
| `skill-security-auditor` | Scan a new third-party skill before adding it to this directory. |

Use a skill by naming it in the request, for example `@data-quality-auditor`, `@senior-ml-engineer`, `@diagram-design` or `@ponytail-review`. Skill discovery may also trigger from the description in each `SKILL.md`.

## Boundaries and overlap

- `data-quality-auditor` and the existing `packages/ml` audit code address different layers. The skill gives review guidance; the package is the executable, tested data contract. Do not replace the package with prose instructions.
- `senior-data-scientist` owns modeling and evaluation reasoning; `senior-ml-engineer` owns deployment and operational concerns. They should be used together only when both concerns are present.
- `senior-architect` and `diagram-design` overlap on architecture diagrams. The former decides what the system should do; the latter renders the chosen design.
- `code-reviewer` checks correctness and risk. `ponytail-review` checks only unnecessary complexity. They are complementary, not substitutes.
- `dependency-auditor` and `skill-security-auditor` are separate gates: one reviews project dependencies, the other reviews agent skill contents.
- No upstream lifecycle hooks or plugin manifests are copied. These skills are passive project files and do not change Codex hooks, MCP servers or application runtime behavior.

## Context Mode

`mksglu/context-mode` is an MCP server plus Codex plugin hooks, not a standalone skill. Its `context-mode` skill assumes that `ctx_*` MCP tools are installed and reachable. Copying only its `SKILL.md` would create instructions for tools that are not present in this project, so it is deliberately not vendored here.

Optional user-level setup is outside this integration; no install command or hook activation is prescribed here.

## Updating

Each copied skill is pinned to the upstream commit recorded in [`THIRD_PARTY_NOTICES.md`](../../THIRD_PARTY_NOTICES.md). Review upstream changes, run `skill-security-auditor`, then replace the affected skill directory in a dedicated commit. Do not update all upstream skills blindly.

## SilentWatt usage constraints

These project constraints take precedence over generic upstream examples. See
[`AGENTS.md`](../../AGENTS.md) and the [P0 review](../../docs/project-status/p0-verification-2026-09-17.md).

- All 15 upstream skill directories are preserved at their pinned revisions;
  examples are reference material, not executable project acceptance criteria.
- The six scripts under `senior-data-scientist/scripts/` and
  `senior-ml-engineer/scripts/` are scaffolds: their `_execute()` methods return
  success without implementing analysis/deployment. Do not execute them as
  verification, treat `completed` as evidence, or wire them into CI/production.
- For SilentWatt time series, use chronological splits and past-only features
  grouped by household. Never apply shuffled cross-validation, centered rolling
  windows, future targets, or full-data transformer fitting from generic examples.
- Generic missingness heuristics do not establish MCAR/MAR/MNAR. Mean imputation,
  outlier clipping and keeping an arbitrary duplicate are not authorized data
  cleaning rules. Reuse `packages/ml` and preserve unknowns for owner decisions.
- The profiler's DQS is not a validated SilentWatt readiness score. Units, device
  mapping and sensor validity remain unverified; report DQS as not established.
  Its in-memory CSV loader is not appropriate for the full 2.6 GB minute dataset.
- Example deployment stacks, model stores and monitoring thresholds do not justify
  adding dependencies or services to the current offline pipeline/Express app.
- The security scanner is static and does not perform live advisory lookups or
  fully analyze embedded HTML scripts. Review suppressions and findings manually.
  Diagram HTML templates load Google Fonts if opened; use local fonts for private
  offline diagrams. No application hook, MCP server or CI execution is installed.

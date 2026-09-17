# SilentWatt Agent Guidelines

## Workflow

### 1. Plan Before Non-Trivial Work

- Write a plan before architectural decisions, ML/data decisions, or tasks involving multiple meaningful steps; use plan mode when available.
- Keep simple, low-risk changes direct.
- If assumptions fail or the implementation diverges from the plan, stop and re-plan.
- Include verification in the plan, not only implementation.

### 2. Use Specialized Skills Deliberately

- Use project skills from `.codex/skills/` when their expertise matches the task.
- Read `.codex/skills/README.md` for project-specific constraints before applying upstream examples; skill scaffolds are not validated pipeline tools.
- Use `ponytail` for code implementation and modification.
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

- Prioritize: correctness → simplicity → minimal impact → elegance.
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

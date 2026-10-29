# Research queue

Use the cycle: research -> hypothesis -> pre-registered design -> baseline -> change -> real archived challenge -> independent verification -> failure analysis -> checkpoint. Cite primary evidence separately from assumptions. A held-out challenge that informs any change becomes development material.

## RQ-001 — Enforceable experiment budgets (highest priority)

- **Question:** Can the runner enforce bounded wall time and solver/tool usage while preserving its persistent-thread policy and cleaning up local services/workspaces?
- **Hypothesis:** An explicit per-run budget plus cancellation/cleanup produces a safely bounded experiment without changing solver prompts or default policy.
- **Evidence:** `src/agent.js` consumes Codex SDK streamed events but has no timeout/token-budget controls; `src/runner.js` limits continuation rounds only. Local service lifecycle cleanup exists in `src/service.js`.
- **Design:** Development fixtures first; test timeout during a turn and service cleanup; record token usage where events provide it. Do not use a held-out challenge for implementation debugging.
- **Acceptance:** Deterministic tests prove wall timeout, at-most-two rounds, cancellation, and service cleanup; no leaked child/service process.
- **Status:** Open. Blocks any model-powered archived run under the user’s required resource-safety gate.

## RQ-002 — Evaluation registry and held-out hygiene

- **Question:** Can benchmark role, selection date, artifact hashes, verifier custody, exposure, and contamination be tracked without relying on conversational memory?
- **Hypothesis:** A small registry with immutable experiment entries makes benchmark role changes auditable.
- **Design:** Start with documented schema and append-only ledger; implement registry only when selecting a genuinely unused challenge.
- **Status:** Open.

## RQ-003 — Efficient skill retrieval and routing proof

- **Question:** Do focused references opened under one primary category improve TTF or verified rate compared with broader retrieval?
- **Design:** Repeated, matched development cases; record opened references, tokens if available, rounds, verified outcome and TTF. Do not alter the frozen routing policy on one run.
- **Status:** Open.

## Research sources reviewed

- Primary project evidence: CTF Racer `PROJECT_STATE.md`, suite reports, implementation and tests.
- Canonical knowledge architecture: Skills V2 `README.md`, `CATALOG.md`, and `ctf-skill-upgrade/SKILL.md`.
- External source review for this checkpoint: none. Treat model capabilities/economics and broad agent research claims as unverified until current primary sources are reviewed for a specific experiment.

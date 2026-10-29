# Repository instructions

Startup read order: `AGENTS.md` -> `PROJECT_STATE.md` -> `docs/HANDOFF.md` -> `ARCHITECTURE.md` -> `docs/ROADMAP.md` / `docs/RESEARCH_QUEUE.md` -> latest report. Check Git status and recent commits before editing. The experiment ledger is append-only; never rewrite prior entries. Keep one authoritative location per fact as documented in `docs/README.md`.

This repository implements a competition-authorized CTF automation framework.

V1 invariants:
- One challenge maps to exactly one persistent Codex agent/thread.
- One challenge gets its own isolated workspace.
- Do not add within-challenge subagents or agent races in V1.
- Do not infer difficulty from points, solve count, or elapsed time.
- Keep challenge network access disabled by default.
- Preserve benchmarkability: state transitions and outputs should be auditable.

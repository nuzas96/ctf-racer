# Repository instructions

This repository implements a competition-authorized CTF automation framework.

V1 invariants:
- One challenge maps to exactly one persistent Codex agent/thread.
- One challenge gets its own isolated workspace.
- Do not add within-challenge subagents or agent races in V1.
- Do not infer difficulty from points, solve count, or elapsed time.
- Keep challenge network access disabled by default.
- Preserve benchmarkability: state transitions and outputs should be auditable.

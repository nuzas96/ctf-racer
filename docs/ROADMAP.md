# Research roadmap

This roadmap tracks gates, not promises. Update it when evidence changes priorities.

## Completed / verified

- Frozen autonomous-first execution policy and independent controller verification.
- Five-category CSAW clean pass: 5/5 once; three-run sample: 14/15.
- Cross-challenge race and platform-neutral intake/watch paths implemented.
- Bootstrap continuity architecture added in this branch (2026-10-28); validation pending this checkpoint.

## Next milestones

1. **Make bounded experiments enforceable** — add per-run round, wall-clock and tool/resource budgets with durable cancellation and safe cleanup. Current SDK path exposes no dependable wall-clock or token cap.
2. **Add zero-token research status/report command** — consume project state and append-only ledger; never invoke Codex or rerun challenges.
3. **Expand held-out evaluation protocol** — register artifacts and independent verifiers before exposure; keep a development/held-out/regression registry and contamination transitions.
4. **Run a new held-out category experiment** — only after milestone 1; pre-register plan and enforce budgets before Luna Medium invocation.
5. **Measure model usage and retrieval** — retain Luna Medium baseline; compare alternatives only with repeated controlled trials and documented current economics.

## Dependencies

Milestone 4 depends on 1 and 3. Model comparisons depend on 1 and a registered evaluation set. No architecture-policy change is approved by this roadmap.

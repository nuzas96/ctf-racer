# Research roadmap

This roadmap tracks gates, not promises. Update it when evidence changes priorities.

## Completed / verified

- Frozen autonomous-first execution policy and independent controller verification.
- Five-category CSAW clean pass: 5/5 once; three-run sample: 14/15.
- Cross-challenge race and platform-neutral intake/watch paths implemented.
- Bootstrap continuity architecture added and verified on this branch (2026-10-28).
- Initial public-agent architecture review and six-category NYU dataset metadata pinned (2026-10-29).
- Per-run continuation-round cap implemented; existing suite grows from 47 to 49 tests.
- Alternate NYU development Forensics fixture prepared, hash-verified, answer-isolated, and zero-token preflighted.

## Next milestones

1. **Prevent temporary storage exhaustion** — add a zero-token preflight for available `/tmp` and workspace space, because a full `/tmp` invalidated an otherwise safe local run.
2. **Complete bounded runner control** — persist stop reason/terminal status on interruption, integrate a wall-clock cap and child cancellation, then service cleanup. The round cap now supports per-run lowering; token/cost caps remain unverified.
3. **Run prepared development fixture** — after a zero-token storage check and terminal timeout handling, run `local-challenges/nyu-dev-2016-pure-poetry` once under Luna Medium with an explicit wall cap; report token telemetry. Do not tune on NYU test split.
4. **Broaden the development subset** — prepare one reproducible candidate in Misc and one in a non-static category, checking licenses and keeping answer material separate.
5. **Formalize held-out hygiene** — register source commit/hash, verifier custody, exposure and contamination transitions before any test-split run.
6. **Measure model usage and retrieval** — retain Luna Medium baseline; compare alternatives only with repeated controlled trials and current documented economics.

## Dependencies

Milestones 3 and 4 require storage safety and artifact/verifier isolation. Model comparisons require budget visibility and a registered evaluation set. No architecture-policy change is approved by this roadmap.

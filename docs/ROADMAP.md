# Research roadmap

This roadmap tracks gates, not promises. Update it when evidence changes priorities.

## Completed / verified

- Frozen autonomous-first execution policy and independent controller verification.
- Five-category CSAW clean pass: 5/5 once; three-run sample: 14/15.
- Cross-challenge race and platform-neutral intake/watch paths implemented.
- Bootstrap continuity architecture added and verified on this branch (2026-10-28).
- Initial public-agent architecture review and six-category NYU dataset metadata pinned (2026-10-29).
- Per-run continuation-round cap implemented; existing suite grows from 47 to 49 tests.
- NYU development Forensics fixture prepared and hash-verified; one bounded attempt completed unsolved. Workspace did not contain answer/verifier, but host-level read isolation remains unproven.
- Actual temp/workspace filesystem preflight and 2-second storage monitoring added.
- Per-run wall timeout, SDK turn cancellation, process-group termination, terminal interruption state and bounded service cleanup added; 56/56 deterministic tests pass.
- One Luna Medium NYU development attempt completed in 2 rounds / 174.195s, unsolved; excluded from strict verifier-isolated solve-rate evidence due host-read isolation limitation.

## Next milestones

1. **Prove verifier isolation at the OS boundary** — run the solver as a separate UID or in a container/mount policy that cannot read the held answer/verifier directory; add a deterministic negative-access test. Current workspace isolation is not sufficient evidence.
2. **Improve old Macintosh resource triage** — investigate a reusable, provenance-backed Rez/ncif vector decoder or recognition/tool diagnostic. Validate on a separate development fixture before modifying the canonical skill or repeating Pure Poetry.
3. **Broaden isolated development coverage** — select one reproducible Misc or non-static challenge with verifier material unavailable to the solver process.
4. **Measure model usage and retrieval** — retain Luna Medium baseline; compare alternatives only with repeated controlled trials and current documented economics. SDK stream exposes token usage, but no hard token/cost ceiling is enforced yet.
5. **Formalize held-out hygiene** — register source commit/hash, verifier custody, exposure and contamination transitions before any test-split run.

## Dependencies

Service and storage controls are implemented, but strict verifier isolation remains a gate for future scored experiments. Model comparisons require budget visibility and a registered evaluation set. No architecture-policy change is approved by this roadmap.

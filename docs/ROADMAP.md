# Research roadmap

This roadmap tracks gates, not promises. Update it when evidence changes priorities.

## Completed / verified

- Frozen autonomous-first execution policy and independent controller verification.
- Five-category CSAW clean pass: 5/5 once; three-run sample: 14/15.
- Cross-challenge race and platform-neutral intake/watch paths implemented.
- Bootstrap continuity architecture added and verified on this branch (2026-10-28).
- Initial public-agent architecture review and six-category NYU dataset metadata pinned (2026-10-29).
- Per-run continuation-round cap implemented; existing suite grows from 47 to 49 tests.
- NYU development Forensics fixture prepared and hash-verified; one bounded attempt completed unsolved, with host-level isolation initially unproven. Later custody correction retained.
- Actual temp/workspace filesystem preflight and 2-second storage monitoring added.
- Per-run wall timeout, SDK turn cancellation, process-group termination, terminal interruption state and bounded service cleanup added; 56/56 deterministic tests pass.
- Pure Poetry Luna attempt remains integrity-limited historical evidence.
- Host-level solver-view verifier denial demonstrated with Codex Linux permission-profile subprocess; direct/symlink/proc-root/hardlink probes denied while controller retained reads.
- HVIF converter and generic Rez extractor validated on benign generated samples and Pure Poetry format; canonical forensics skill upgrade implemented.
- Palo Alto NYU development case attempted with Luna Medium, 2 rounds/240s; runner stopped at 239.823s as `environment_interrupted`, no candidate/verification, excluded from SR.

## Next milestones

1. **Improve ELF32 reverse-analysis readiness** — use a separate archived development fixture to measure deterministic detection and tool prep for `qemu-i386`/Ghidra; Palo Alto itself is now contaminated development material.
2. **Generalize HVIF methodology** — apply the new extractor/converter workflow to a different authorized `.rdef` or public benign icon sample; preserve the current skill change unless evidence reveals a generic defect.
3. **Broaden isolated development coverage** — choose an untouched NYU development case outside reverse and forensics, verify artifacts and isolation, then preregister one bounded Luna run.
4. **Measure model usage and retrieval** — retain Luna Medium baseline; compare alternatives only with repeated controlled trials and current documented economics. SDK stream exposes token usage, but no hard token/cost ceiling is enforced yet.
5. **Formalize held-out hygiene** — register source commit/hash, verifier custody, exposure and contamination transitions before any test-split run.

## Dependencies

Wall-time, storage and tested solver-view verifier-deny controls are implemented for this Linux/Codex setup; isolation must be re-probed after SDK/policy changes. Token/cost hard caps are still absent. Model comparisons require budget visibility and a registered evaluation set. No architecture-policy change is approved by this roadmap.

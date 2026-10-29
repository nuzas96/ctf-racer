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


## 2026-10-29 follow-on execution

- A deterministic ELF readiness helper now reports header/loader/protections/tool support. Benign static ELF32 validation and a no-import Ghidra usage probe are complete; elapsed-time reduction was not demonstrated.
- HVIF extraction/conversion passed again on unrelated synthetic Rez material with exact byte equality and visually checked PNG output.
- The preregistered Bricks of Gold NYU development Crypto run was stopped as integrity-limited after an archive-cache access gap was found; it is excluded from SR. The following development Misc case, Networking 1, solved and was independently verified in 36.718s; see the current report and ledger.

## 2026-10-29 fresh evaluation and isolation extension

- The original cache omission was found by a zero-token direct-read probe; the affected Bricks run is integrity-interrupted and excluded from SR.
- NYU archive caches were moved under `runs/_research-cache`, which the runner denies and probes along with challenge-declared source files. The current same-UID Codex sandbox test denies direct, symlink and hardlink access while controller reads remain intact.
- One fresh NYU development Misc case (Networking 1) solved and independently verified in 36.718s / one round under Luna Medium. This broadens observed coverage but is not a solve-rate or hard-challenge generalization claim.
- CTF Racer test suite after changes: 61/61 passed.
- Next gate: an untouched, multi-step NYU development Crypto challenge under the expanded source-cache boundary; pre-register and retain one primary Luna solver with bounded wall time.

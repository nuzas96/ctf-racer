# Research roadmap

This roadmap tracks gates, not promises. Update it when evidence changes priorities.

## Current gate status — 2026-11-06

- Offline CTFd mock adapter is implemented and pushed in `3ce81565806f752a428e52bed81e47da3626e79b`; it reuses normalized intake, watch/race plumbing and independent verification.
- The observational hypothesis cohort completed with Reverse `deedeedee` verified at 221.78s; Crypto `onlythisprogram` unsolved within its 600s wall budget; Forensics `pcapin` unsolved at 599.259s/600s. `Watchword` was withdrawn before solver start. Checklist availability was confirmed, but the focused triage checklist was not opened in any of these runs. No causal improvement claim is supported.
- Controller-only transport is implemented in `src/ctfd-transport.js`; local TLS transport/isolation suites pass 11/11 and 16/16, and the full suite passes 81/81. Exact-origin/IP pinning and TLS/redirect/size/time checks apply to this client; they are not kernel-enforced controller egress. The solver remains network-disabled. No live credentials or platform calls were used. Next gates: validate target-specific schemas offline, then require explicit authorization and an approved read-only smoke test before any real connection.

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

1. **Pin an authorized target contract offline** — capture CTFd version/OpenAPI schemas and sanitized pagination, attachment, authentication, and attempt-verdict fixtures. No live endpoint before explicit authorization.
2. **Prepare a read-only live gate** — only after authorization, target URL/version, secret provider, exact hostname/IP/TLS review, bounded attachment handling, and a clear separation from disabled solver networking. Obtain separate operator approval before actual flag submissions.
3. **Continue fresh CTF capability evaluation separately** — all current cohort cases are development-exposed; use only newly preregistered material.

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


## 2026-10-29 capability checkpoint

- **Completed:** Two-fixture static AVR GPIO validation; focused Skills V2 reverse reference accepted with explicit limits.
- **Completed:** Retrospective evidence ranking across Wieners/Cloudb and a small canonical `ctf-solve` checklist update. Causal benefit remains unproven.
- **Completed:** One fresh local-service Pwn evaluation (Tutorial), independently solved in 411.937s / one round with Luna Medium.
- **Completed:** Close the previously unprobed service-runtime path gap: dynamic `/tmp` runtime and secret roots are now denied/probed before model-session creation.
- **Pending:** Evaluate hypothesis-prioritization effects over at least three future untouched development challenges; do not infer gains from one solve.
- **Next dependency:** Validate target-libc compatibility/discovery on two benign local services and implement host-scoped egress or another enforced local-only service boundary before further broad network-enabled model experiments.

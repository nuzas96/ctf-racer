# CTF Racer research report — 2026-10-29

## Current checkpoint

Branch `research/bootstrap-continuity-2026-10-28`, resumed at `738fb9a5f3355b566debe53d3b9b27507178a382`. Frozen solve policy remains one Luna Medium primary thread per challenge, `ctf-solve` plus one category skill, isolated solver workspace, challenge network disabled by default, and controller-side independent flag verification. No competitor review or benchmark bootstrap was repeated.

## Engineering completed

- `solve` now checks free bytes with `statfs` on the actual temporary and workspace filesystems before model execution. It reserves 128 MiB on each distinct filesystem plus workspace artifact-copy overhead.
- Storage availability is sampled every 2 seconds and appended to a unique run file under `runs/_storage/`.
- `--timeout-seconds N` (1–3600, default 900) aborts the Codex SDK streamed turn via its supported `AbortSignal`; SIGINT/SIGTERM and low storage use the same cancellation path.
- Cancellation persists `environment_interrupted` plus a terminal reason, keeping it distinct from an ordinary solver failure.
- Child commands are placed in a process group and terminated on timeout/abort with TERM then KILL. Docker Compose calls have timeouts; `docker ps` inspection has a 10-second timeout; cleanup runs on service teardown and is capped at 30 seconds.
- Tests cover storage preflight/monitor, normal completion, timed and explicit interruption, durable runner state, hung subprocess termination, and service cleanup on success/error/interruption/startup failure.

**Validation:** 56/56 tests passed with `/home/nuzhmi/.nvm/versions/node/v24.19.0/bin/npm test`. The documented system npm mismatch was left untouched.

## Pure Poetry development attempt

Source: NYU CTF Bench GPL-2.0, commit `b899e00ae75e9c55a2521ec890125298ca6a4b0e`, `development/2016/CSAW-Finals/forensics/pure_poetry`. The 11,844-byte artifact matched both the pinned Git blob SHA-1 (`6792d3af2c09b9d432b5a29cedddedb96416a446`) and SHA-256 (`cc4d3bfaccae770a04d8a069d00fbf4aa9acc0c995ca5716a77743df046a86fc`). An independent source-answer digest check matched the fixture verifier before execution; no answer or verifier digest appeared in the initial solver workspace or saved evidence.

Run: one primary attempt, Luna Medium, two rounds, zero retries, 240-second wall limit, challenge network off. Routed `$ctf-solve + $ctf-forensics`; skill proof passed with `stego-image.md` and `references/stego-detection.md` opened. Storage preflight passed; `/tmp` began with 5,332,221,952 free bytes and the workspace filesystem with 14,715,236,352. Storage remained healthy.

**Outcome: unsolved, no candidate, no independently verified flag.** TTF is not applicable. Solver elapsed time was 174.195 seconds. Usage was 1,284,592 input tokens (1,163,008 cached), 19,052 output (11,811 reasoning); cost was unavailable. It identified a Rez `VECTOR:ICON` resource with a 5,471-byte `ncif` payload and probed structured records, but did not recover the key. Two command errors (shell quoting and a malformed Python probe) were later worked around. The substantive failure is a legacy vector-icon decoding/tooling knowledge gap; this one development run does not justify a skill change.

### Verifier custody limitation

The answer JSON was outside the workspace and neither the answer nor verifier digest appeared in the trace. However, the model shell read a user memory file outside the workspace. This proves `workspace-write` did not establish host-wide read denial. There is no evidence the answer JSON was opened, but we cannot claim the solver was technically unable to read it. The ledger correction therefore classifies the attempt as **integrity-limited development evidence**, excluded from strict verifier-isolated solve-rate metrics. A future scored run must pass a separate-UID/container/mount-policy canary-denial test.

## Prior Ghost result classification

The 2026-10-29 Ghost regression was stopped after `/tmp` exhaustion. Its earlier `STOPPED_UNSOLVED` record is preserved; an append-only correction reclassifies it as `ENVIRONMENT_INTERRUPTED`, not a solver failure. It is excluded from solve-rate denominators.

## Durable evidence

- Structured append-only results and corrections: `docs/EXPERIMENT_LEDGER.jsonl`.
- Safe redacted run records: `docs/reports/experiments/EXP-2026-10-29-NYU-PURE-POETRY/`.
- Exact continuation state: `docs/HANDOFF.md`.
- Pure Poetry source and artifact details plus queue: `docs/RESEARCH_QUEUE.md`.

## Next measurable opportunity

First, implement a zero-token verifier-isolation boundary and prove the solver process cannot read a canary under the verifier directory while the controller can verify. Then investigate reusable Rez/ncif tooling and test it on a separate development fixture. Do not repeat Pure Poetry for tuning, modify Skills V2 from this single unsolved run, or use the NYU test split.

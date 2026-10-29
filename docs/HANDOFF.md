# Continuation handoff

Updated 2026-10-29. Branch: `research/bootstrap-continuity-2026-10-28`.

## Start here

Read repository `AGENTS.md`, `PROJECT_STATE.md`, this file, then `ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/RESEARCH_QUEUE.md`, and latest report. Check `git status` before edits. Skills V2 canonical worktree is `/home/nuzhmi/Desktop/codex-skills-github`; inspect its status and `ctf-skill-upgrade/SKILL.md` before any knowledge change. Do not touch its pre-existing untracked `....` file.

## Verified checkpoint

- Current CTF Racer base was `012399f`; clean before this branch. Skills V2 base was `7a4bcda`; pre-existing untracked `....` preserved.
- Existing state documents record Luna Medium, autonomous-first flow, five-category single pass 5/5, robustness 14/15, race 5/5 at 335.15s, watch/intake; latest tests documented 47/47 (not the requested historical 48/48).
- One real archived regression attempt was run and stopped unsolved after 365s due temporary-filesystem exhaustion. The PCAP was present; see the ledger correction and result records. No candidate/verified flag and no retry.
- System `/usr/bin/npm ls` fails with an LRU export mismatch; NVM npm 11.17.0 works and reports the local SDK dependency. No dependency upgrade.
- Latest validation: 56/56 tests pass using `/home/nuzhmi/.nvm/versions/node/v24.19.0/bin/npm test`; this includes timeout, interrupt, storage, hung-child and service-cleanup fixtures.
- Research reviewed Veria Labs `ctf-agent`, NYU agents/bench, Cybench and CTF-Dojo. NYU metadata snapshots are in `/var/tmp/ctf-racer-research-cache/`; do not clone the full dataset into `/tmp` again. `/tmp` filled because two full clones consumed ~5.1 GB.
- Ghost regression experiment was attempted and stopped unsolved at 365s. One completed turn reported 766,097 input / 6,115 output tokens. The solver got a repaired PCAP and TTL split; the workspace then failed writes because `/tmp` was full. No retry. Result and append-only hash correction are in the ledger.
- Safe redacted run logs/state/PROGRESS/skill proof are preserved under `docs/reports/experiments/EXP-2026-10-29-GHOST-REGRESSION/` and indexed with hashes.
- System npm root cause: `hosted-git-info` constructs `LRU`, but system `lru-cache` exports `{LRUCache}`. Use `/home/nuzhmi/.nvm/versions/node/v24.19.0/bin/npm`; `npm ls` and `npm test` pass. No dependency upgrade.
- Per-run solve flag `--max-rounds N` now limits rounds below the configured cap. Tests: 49/49 pass with NVM npm 11.17.0.
- Added zero-token disk preflight for actual temp/workspace filesystems, 2-second storage sampling, per-run `--timeout-seconds N`, SDK abort, process-group termination, durable `environment_interrupted` state, and bounded Compose cleanup.
- Pure Poetry was run once: Luna Medium, 2 rounds, no retries, 240-second wall limit, 174.195 seconds elapsed. It was unsolved with no candidate; usage 1,284,592 input (1,163,008 cached), 19,052 output (11,811 reasoning). See `EXP-2026-10-29-NYU-PURE-POETRY-RUN-RESULT`.
- Verifier custody correction: answer/digest were absent from solver workspace and saved logs, but telemetry shows host files outside the workspace were readable. The private answer's OS-level inaccessibility was not established; exclude the run from strict verifier-isolated solve-rate evidence.
- Safe run evidence is under `docs/reports/experiments/EXP-2026-10-29-NYU-PURE-POETRY/`; artifact and private-source hashes/checks are recorded in the ledger. Skills V2 remains unchanged.

## Exact next action

The current highest-priority task is a zero-token verifier-isolation gate: run the solver as a separate UID or with a container/mount policy that denies a deterministic canary in the verifier directory; the controller must still verify independently. The existing `workspace-write` configuration does not establish host read-denial. After that, research a reusable Rez/ncif decoding method and validate it on separate development fixtures before updating Skills V2. Do not rerun Pure Poetry as tuning and do not use NYU test-split cases.

## Remaining checkpoint work

Resource controls and safe experiment evidence are implemented. The Pure Poetry attempt is complete and is not a verified solve. Validate JSONL/unique IDs, run the full test suite, inspect staged changes, then commit/push only this development branch. Do not merge into main. Preserve the Skills V2 worktree's existing `....` untracked file.

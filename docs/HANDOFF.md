# Continuation handoff

Updated 2026-10-29. Branch: `research/bootstrap-continuity-2026-10-28`.

## Start here

Read repository `AGENTS.md`, `PROJECT_STATE.md`, this file, then `ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/RESEARCH_QUEUE.md`, and latest report. Check `git status` before edits. Skills V2 canonical worktree is `/home/nuzhmi/Desktop/codex-skills-github`; inspect its status and `ctf-skill-upgrade/SKILL.md` before any knowledge change. Do not touch its pre-existing untracked `....` file.

## Verified checkpoint

- Current CTF Racer base was `012399f`; clean before this branch. Skills V2 base was `7a4bcda`; pre-existing untracked `....` preserved.
- Existing state documents record Luna Medium, autonomous-first flow, five-category single pass 5/5, robustness 14/15, race 5/5 at 335.15s, watch/intake; latest tests documented 47/47 (not the requested historical 48/48).
- One real archived regression attempt was run and stopped unsolved after 365s due temporary-filesystem exhaustion. The PCAP was present; see the ledger correction and result records. No candidate/verified flag and no retry.
- System `/usr/bin/npm ls` fails with an LRU export mismatch; NVM npm 11.17.0 works and reports the local SDK dependency. No dependency upgrade.
- Validation: 49/49 tests pass; JSONL validates; zero-token status command runs; branch diff still requires final check/commit.
- Research reviewed Veria Labs `ctf-agent`, NYU agents/bench, Cybench and CTF-Dojo. NYU metadata snapshots are in `/var/tmp/ctf-racer-research-cache/`; do not clone the full dataset into `/tmp` again. `/tmp` filled because two full clones consumed ~5.1 GB.
- Ghost regression experiment was attempted and stopped unsolved at 365s. One completed turn reported 766,097 input / 6,115 output tokens. The solver got a repaired PCAP and TTL split; the workspace then failed writes because `/tmp` was full. No retry. Result and append-only hash correction are in the ledger.
- Safe redacted run logs/state/PROGRESS/skill proof are preserved under `docs/reports/experiments/EXP-2026-10-29-GHOST-REGRESSION/` and indexed with hashes.
- System npm root cause: `hosted-git-info` constructs `LRU`, but system `lru-cache` exports `{LRUCache}`. Use `/home/nuzhmi/.nvm/versions/node/v24.19.0/bin/npm`; `npm ls` and `npm test` pass. No dependency upgrade.
- Per-run solve flag `--max-rounds N` now limits rounds below the configured cap. Tests: 49/49 pass with NVM npm 11.17.0.
- Prepared alternative development fixture: ignored local path `local-challenges/nyu-dev-2016-pure-poetry`, source commit b899e00ae75e9c55a2521ec890125298ca6a4b0e, GPL-2.0. Artifact and isolated verifier passed loader/hash/zero-token checks. Raw answer is mode 600 outside the solver workspace.

## Exact next action

`/tmp` recovery is complete and currently shows 5 GB free. Implement zero-token storage-capacity preflight and integrate timeout cancellation so interrupted runs persist a terminal reason; add deterministic tests. Do not use further large full benchmark clones. The NYU development fixture is already pinned and prepared; after the guards, run it once with Luna Medium and an explicit wall bound. Do not tune on test-split cases. Keep one solver and no retry by default.

## Remaining checkpoint work

The cache migration is complete and `/tmp` is recovered. Inspect the latest diff, commit verified code/research updates on this feature branch, and push only this development branch. Never merge automatically.

# Continuation handoff

Updated 2026-10-29. CTF Racer branch: `research/bootstrap-continuity-2026-10-28`; base checkpoint `39164cb6b1e245ee4e8fd6ab633d10090d153275`. Skills V2 branch: `research/ctf-forensics-hvif-2026-10-29`; preserve its pre-existing untracked `....` file.

## Startup order

Read root `AGENTS.md`, `PROJECT_STATE.md`, this handoff, `ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/RESEARCH_QUEUE.md`, latest report, and ledger. Check both worktrees and branches before edits. For canonical knowledge work, reread `/home/nuzhmi/.codex/skills/ctf-skill-upgrade/SKILL.md`, then Skills V2 README/CATALOG and its validation scripts. Use NVM npm at `/home/nuzhmi/.nvm/versions/node/v24.19.0/bin/npm`; the diagnosed system npm/LRU mismatch remains untouched.

## Verified checkpoint

- CTF Racer `npm test`: **60/60 passed**, including actual Codex sandbox canary denial, path config checks, timeout/interrupt/hung child, storage, service cleanup and prior runner tests. Skills V2 helper tests: **5/5 passed**; `python3 scripts/validate_skills.py --strict-migration`: 14 skills, 227 Markdown files, 0 errors, 0 warnings, no legacy entrypoints/directories.
- Verifier boundary is demonstrated on this host using actual SDK-bundled Linux Codex sandbox. Solver shares UID 1000 with controller, but profile denies direct, symlink, `/proc/self/root`, `/proc/<controller>/root`, and hardlink reads of canary and protected challenge/auth/verifier files; controller reads remain available. This is policy-profile filesystem isolation, not separate UID/container isolation. Rerun probe after SDK/policy upgrades.
- HVIF tooling: MIT `threedeyes/hvif-tools` at `3789a261230fd6faad0dfda3b7b2743a2d878125`; Linux `icon2icon` built. Benign SVG→HVIF→SVG/PNG passed; malformed and truncated payloads rejected. Generic Rez helper extracted `ncif` from Pure Poetry `VECTOR:ICON`; rendered output was abstract and not a solve. Skills V2 upgrade is validated on `research/ctf-forensics-hvif-2026-10-29`; no solve-rate gain claimed.
- One fresh NYU CTF Bench development challenge attempted: Palo Alto (Reverse), pinned commit `b899e00ae75e9c55a2521ec890125298ca6a4b0e`, GPL-2.0, artifact SHA-256 in ledger. Luna Medium, `ctf-solve + ctf-reverse`, one attempt, two rounds, 0 retries, 240s wall cap. Terminal `environment_interrupted / wall_timeout` at 239.823s; no candidate, no independent verification, no TTF. Partial completed-turn usage: 928,953 input (854,272 cached), 4,537 output (1,349 reasoning); second turn usage unavailable after abort. Not a solver failure; excluded from SR. Safe evidence and checksums under `docs/reports/experiments/EXP-2026-10-29-NYU-PALO-ALTO/`.
- Palo Alto required `qemu-i386` for 32-bit execution due host syscall limits; Ghidra setup/analysis consumed time and only two arithmetic validations were solved. Do not tune on Palo Alto; it is now exposed development material.
- Historical baselines stay historical: 5/5 clean five-category pass, 14/15 3-run sample, cross-category race 5/5 in 335.15s. They do not predict unseen tasks. Pure Poetry remains integrity-limited historical evidence.

## Exact next action

Create/use a separate benign or archived development ELF32 sample to measure zero-token reverse-tool preflight and Ghidra/qemu readiness. In parallel, use an unrelated public `.rdef`/HVIF sample to validate the new generic extraction/render workflow. Then select an untouched NYU development case in a category outside Reverse/Forensics, preregister it, confirm artifact hashes/verifier custody and the isolation probe, and run one bounded Luna Medium attempt. Keep one solver; do not use NYU test split.

## Checkpoint bookkeeping

Append experiment evidence and corrections to `docs/EXPERIMENT_LEDGER.jsonl`; do not rewrite history. Refresh `PROJECT_STATE.md`, research queue, this handoff and `docs/reports/LATEST.md` at each milestone. Current work remains uncommitted pending final review; commit/push only these feature branches, never merge to main.

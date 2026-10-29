# Continuation handoff

Updated 2026-10-29. CTF Racer branch: `research/bootstrap-continuity-2026-10-28`, resumed from `930400173e4eb8781b26ea4b600a902eec74ab26` (check `git rev-parse HEAD` for the latest pushed checkpoint). Canonical Skills V2 branch: `research/ctf-forensics-hvif-2026-10-29`, verified commit `f5bbf1c12f805bc2a90e909f172eae64bf7b3d07`. Preserve its pre-existing untracked file `....`.

## Startup order

Read root `AGENTS.md`, `PROJECT_STATE.md`, this handoff, `ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/RESEARCH_QUEUE.md`, latest report, then ledger. Check both worktrees, branch and status before editing. For canonical skill changes, follow `/home/nuzhmi/.codex/skills/ctf-skill-upgrade/SKILL.md`, then Skills V2 README/CATALOG and validation scripts. Use NVM npm at `/home/nuzhmi/.nvm/versions/node/v24.19.0/bin/npm`; do not alter the diagnosed system npm/LRU mismatch.

## Verified state

- Frozen solving baseline: one persistent primary thread per challenge, `gpt-6-luna` medium, `ctf-solve + one category skill`, isolated workspace, independent controller verification. No model/topology change.
- CTF Racer deterministic suite: **61/61 passed** after the research-cache isolation extension.
- Verifier isolation: actual bundled Codex Linux sandbox, same UID 1000. The `/var/tmp/ctf-racer-research-cache` directory was relocated beneath `runs/_research-cache`; old path is a symlink. Current probe denied direct, symlink and hardlink reads for eight archive/source/verifier files and preserved controller reads. This is host-specific permission-profile isolation, not separate UID/container isolation; probe after SDK/policy changes and declare any new external answer-bearing roots.
- Bricks of Gold is development-exposed and excluded from SR. Its 4-round run stopped at 396.014s after an audit found its initial probe omitted the external archive cache. No candidate/flag verification; three completed turns reported 3,039,391 input (2,824,192 cached), 57,386 output, 39,791 reasoning; incomplete-turn usage unavailable. The actual sandbox could read source README/JSON, though no trace read was observed. Do not rerun as fresh evaluation.
- NYU CTF Bench Networking 1 (Misc), development split, was run through CTF Racer after the expanded probe: independently verified solve in one round / 36.718s; `ctf-solve + ctf-misc`; first useful test ~15s; 186,311 input (155,392 cached), 1,988 output, 558 reasoning tokens. Safe summary and redacted telemetry: `docs/reports/experiments/EXP-2026-10-29-NYU-NETWORKING-1/`. Keep as regression material; one easy solve does not estimate SR or generalization.
- Reverse readiness helper and independent HVIF conversion validation are in the linked Skills V2 commit. They demonstrated reporting/conversion only, not solve-rate gains. No skill change was justified by Networking 1.
- Historical 5/5 clean suite, 14/15 robustness sample, and 5/5 cross-challenge race remain historical evidence only.

## Prior research task (completed)

The untouched multi-step development Crypto selection and bounded evaluation was completed as `2013f-cry-stfu`; see the 2026-10-29 checkpoint below. It is now exposed development material and must not be presented as a fresh evaluation or retuned as one. Its valid result was unsolved within budget after byte-exact cryptographic recovery but incomplete exact-answer interpretation. Bricks of Gold remains integrity-interrupted and excluded from solve-rate evidence.

## Checkpoint bookkeeping

Ledger is append-only. New records correct the Bricks classification and a pre-registration timestamp typo; no prior entry was rewritten. Keep raw candidate/answer-bearing state under ignored private run paths. The Networking safe telemetry was checked and redacted before being copied into its report directory. Update state, handoff, queue and latest report at each milestone. Commit and push only the existing development branches; never merge to main.

## 2026-10-29 continuation checkpoint — STFU Crypto

CTF Racer at `fe6641552a2b5f4cff3bfc6a39c28ff25585425a` before current uncommitted records; branch `research/bootstrap-continuity-2026-10-28`. Skills V2 remains at `f5bbf1c12f805bc2a90e909f172eae64bf7b3d07` on `research/ctf-forensics-hvif-2026-10-29`; preserve its pre-existing untracked `....`.

Fresh NYU development Crypto challenge `2013f-cry-stfu` ran once through CTF Racer. Artifact hashes, license, archive/snapshot commits, verifier isolation, Luna Medium, routing, wall/round bounds and usage are in `docs/EXPERIMENT_LEDGER.jsonl` and `docs/reports/experiments/EXP-2026-10-29-NYU-STFU/summary.json`. Actual sandbox isolation passed for 16 private/source probe files including symlinks/alternate roots; controller verification remained available. Outcome: unsolved, not interrupted; 4 rounds, 418.129s, 1 rejected candidate, no verified flag/TTF. Usage totals: 8,330,514 input (7,955,840 cached), 73,505 output, 48,156 reasoning; cost unknown. Luna recovered the LFSR and byte-exact decrypt/reencrypt path, but failed exact banner-to-answer interpretation. This is development evidence, not a measured capability gain. Do not rerun as fresh evaluation or tune on the same challenge. No Skills V2/controller improvement accepted.

Next measurable task: use separate benign/development examples to validate reusable banner interpretation and answer-format reasoning, assess OCR/text-render tools deterministically, and only promote a method that passes those checks. Then pre-register an untouched challenge from a different category. Keep Luna Medium and one solver; re-run isolation preflight after environment/policy changes.

Validation completed: CTF Racer full suite **61/61 passed** with NVM npm; ledger JSONL parsing, `research:status`, and `git diff --check` passed. Commit and push the validated records on the Racer branch. No Skills V2 edits are indicated by the STFU result.

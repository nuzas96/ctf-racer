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


## 2026-10-29 continuation checkpoint — answer recovery and Cloudb

Skills V2 on `research/ctf-forensics-hvif-2026-10-29` now has an uncommitted reusable `ctf-forensics` ASCII/banner text recovery reference and route. Preserve untracked `....`. Independent benign validation used three generated FIGlet banners across three fonts; exact re-render comparison distinguished correct from deliberately incorrect readings, whitespace retained, OCR not trusted. Skills validator passed: 14 skills / 229 Markdown / 0 errors / 0 warnings. No solve-rate improvement claim.

Retrospective STFU cause: correct byte-exact LFSR recovery produced a banner, but candidate formatting was guessed despite missing flag syntax; wrapper/prefix normalization failed independent verification. No STFU rerun, no answer in tracked files.

One fresh Cloudb Web development attempt was made (one Luna Medium primary, four rounds max, 600s, no retry/escalation). Artifact/provenance, verifier isolation and controller verifier metadata checks passed. Run ended unsolved after 293.361s; no candidate. Path traversal/arbitrary file read was confirmed by ~24s. Login, registration and JSONP all failed at PDO DB initialization although MySQL port/socket existed. Classify `ENVIRONMENT_LIMITED_UNSOLVED`, exclude from ordinary SR. Usage: 6,142,786 input (5,816,704 cached), 60,568 output, 32,171 reasoning. Summary: `docs/reports/experiments/EXP-2026-10-29-NYU-CLOUDB/summary.json`; ledger pre-registration hash correction and result appended.

Tests: CTF Racer **61/61 passed**. The report/queue/state contain evidence and next steps. Immediate next task: zero-token diagnose Cloudb DB readiness/configuration without rerunning its solver; separately pre-register a fresh archived Reverse/Pwn/Web task. Check both Git states, commit/push only reviewed changes on development branches, never merge to main.


Skills V2 guidance commit `2ff88e1` was pushed to its existing development branch. CTF Racer result/report records are ready to commit; no solver/controller code changed. The preserved untracked Skills V2 file `....` is untouched.


## 2026-10-29 Cloudb diagnosis and active preregistration

Cloudb result classification corrected by append-only ledger entry: database initialization is malformed (literal Compose quote wrappers on MYSQL_PASS plus invalid archived GRANT syntax), but an unauthenticated traversal independently retrieved the app SQL backup; the saved Luna trace did not test it. Therefore record Cloudb as ordinary `SOLVER_UNSOLVED_WITHIN_BUDGET`, not environment-excluded. Backup contents and answer were not emitted or saved. Temporary adapted Compose diagnostic was torn down; no service-readiness controller change accepted.

The preregistered NYU CSAW Finals 2014 Reverse case `return-of-the-weiner` subsequently completed. See the immediately following verified-solve section and `EXP-2026-10-29-NYU-WEINERS-RESULT`; do not repeat it as a fresh evaluation. Its answer-bearing source metadata and test solver remain outside the workspace.


## 2026-10-29 Cloudb correction and verified AVR Reverse solve

Cloudb's malformed MySQL initialization is documented in `EXP-2026-10-29-NYU-CLOUDB-DB-DIAGNOSIS`. Although DB-backed endpoints fail due literal Compose quote wrappers plus invalid archived GRANT SQL, the unauthenticated file-read path retrieved the SQL backup independently and the Luna trace did not try it. Append-only correction classifies Cloudb as ordinary `SOLVER_UNSOLVED_WITHIN_BUDGET`, not environment-excluded. No service readiness controller change was made.

Fresh NYU development Reverse `return-of-the-weiner` solved and independently verified: one Luna Medium primary, `ctf-solve + ctf-reverse`, four rounds, 600s cap; no retries/escalation, no network; **572.671s TTF/elapsed**, zero rejects. First meaningful inspection ~10s. Luna disassembled AVR Intel HEX, spent the first three rounds on an unvalidated bootloader overflow model, then in round four extracted a GPIO output sequence and recovered a valid answer. Independent private-state SHA-256 check passed. Usage: 9,974,669 input / 9,372,160 cached, 155,955 output, 120,285 reasoning; cost unknown. Answer and raw candidate remain out of tracked files. Safe result: `docs/reports/experiments/EXP-2026-10-29-NYU-WEINERS/summary.json`.

No skill/controller improvement accepted yet; add no challenge-specific code. The exact next priority is validate GPIO output recovery on two independent benign AVR firmware examples, then consider a focused `ctf-reverse` method. CTF Racer and Skills V2 test/validator results will be recorded after this checkpoint. CTF Racer branch remains `research/bootstrap-continuity-2026-10-28`; Skills V2 branch remains `research/ctf-forensics-hvif-2026-10-29` with pre-existing untracked `....` untouched.

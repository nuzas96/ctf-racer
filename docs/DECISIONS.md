# Engineering decisions

## D-001 — Preserve autonomous-first baseline

- **Decision:** Keep one persistent primary solver per isolated challenge, Luna Medium baseline, deterministic preflight, one category skill, and independent controller-side flag verification.
- **Evidence:** `PROJECT_STATE.md`; archived clean five-category result 5/5 in one pass; robustness 14/15 across 15 attempts; race 5/5 in 335.15 seconds. The robustness result is a small sample and does not establish unseen-challenge performance.
- **Consequence:** No model escalation or within-challenge parallelism without a controlled, multi-case experiment.

## D-002 — Skills V2 owns reusable solving knowledge

- **Decision:** CTF Racer remains orchestration and execution control; codex-skills remains the canonical method/reference/script layer.
- **Evidence:** Skills V2 README, CATALOG, and ctf-skill-upgrade methodology define category ownership, deduplication, provenance, and validation.
- **Consequence:** Diagnose traces and search canonical skills before adding reusable technique knowledge. Never copy challenge answers into skills.

## D-003 — Initial bootstrap experiment gate (2026-10-28; superseded)

- **Decision at the time:** Record the real archived challenge gate as blocked for the 2026-10-28 checkpoint.
- **Evidence:** Runner round limit is globally configured at four, with no per-run CLI override; SDK turn stream has no demonstrated dependable wall-clock or token cap. Two-round compliance alone would not establish bounded resource use.
- **Consequence at the time:** Continue deterministic work until the next user instruction. No challenge or model call had been made as of 2026-10-28. On 2026-10-29 the user explicitly changed direction to allow practically bounded experiments while resource controls continue; see D-005 and the 2026-10-29 ledger records.

## D-004 — Do not adopt same-challenge model swarms from competitor claims alone

- **Decision:** Keep one primary solver per challenge. Treat Veria Labs' reported 52/52 competition result as a research lead, not causal evidence that swarms improve CTF Racer's verified solve rate or cost efficiency.
- **Evidence:** Veria README is project-authored; its framework combines a coordinator, multiple model backends, Docker containers, costs and trace sharing. NYU D-CIPHER provides planner/executor/auto-prompter variants, but no matched CTF Racer comparison has been performed.
- **Consequence:** Consider an ablation only after representative repeated baseline runs and explicit per-attempt budgets.

## D-005 — Add a per-run round cap that only lowers global policy

- **Decision:** `solve --max-rounds N` may lower but cannot raise `max_continuation_rounds`; retain the configured default.
- **Evidence:** The first real-time regression plan required two rounds while the existing baseline policy was four. A temporary override made the run reproducible without changing repository defaults.
- **Consequence:** Controlled experiments and operators can set a smaller continuation budget with an auditable command-line setting.

## D-006 — Enforce wall/storage stops in the runner

- **Decision:** Keep storage preflight, periodic free-space monitoring, wall timeout, SDK abort, process-group termination, and terminal-state recording in the execution controller; use bounded service teardown.
- **Evidence:** The Ghost regression was environment-interrupted by `/tmp` exhaustion. Pure Poetry completed with the new controls and stable storage; deterministic tests cover normal completion, timeout, interrupt, hung child, and service cleanup. See `EXP-2026-10-29-GHOST-CLASSIFICATION-CORRECTION` and `EXP-2026-10-29-NYU-PURE-POETRY-RUN-RESULT`.
- **Consequence:** Missing token/cost hard caps remain explicit. Wall and disk controls reduce execution risk but do not make model usage free or fully bounded by tokens.

## D-007 — Require OS-level verifier isolation before scored runs

- **Decision:** A verifier file outside the solver workspace with mode 0600 is not enough to claim the solver cannot access it. Require a separate UID or container/mount deny boundary with a deterministic canary test.
- **Evidence:** The Pure Poetry trace shows the Codex shell read a user memory file outside its workspace. No access to the challenge answer was observed, but the host read boundary was not enforced or demonstrated; see the append-only custody correction.
- **Consequence:** Pure Poetry is integrity-limited development evidence and is excluded from strict verifier-isolated solve-rate metrics. Do not run a new scored challenge until the isolation gate passes.


## D-008 — Enforce verifier path denial in the Codex solver view

- **Decision:** Use a named Codex permission profile with explicit filesystem deny paths for local archived challenge source trees, controller verifier storage, and Codex auth file. Fail closed if legacy sandbox configuration may override that profile. Run a zero-token probe against actual private files and a canary before invoking the model.
- **Evidence:** `src/verifier-isolation.js` probes direct read, symlink, `/proc/self/root`, controller `/proc/<pid>/root`, and hardlink creation using the bundled Codex sandbox subprocess. On 2026-10-29 the same-UID solver view denied all probes against the canary and five protected files while controller reads and independent verifier access remained intact. Palo Alto run state records the proof.
- **Limit:** Demonstrated on this Linux Codex SDK setup. This is not separate UID/container isolation and does not establish portability to other platforms or future SDK policy changes. Files in protected roots are checked for unsafe links/permissions.
- **Consequence:** Strictly isolated attempts may proceed only when the probe passes. Re-probe after SDK or policy upgrades.
- **Scope correction (2026-10-29):** The original probe covered the local challenge tree, verifier tree, auth file and canary, but omitted answer-bearing public archive clones in the shared research cache. Bricks of Gold was stopped after the omission was found; see `EXP-2026-10-29-NYU-BRICKS-OF-GOLD-INTEGRITY-CORRECTION`. The original proof therefore established only those listed paths, not all controller-held answer material.

## D-009 — Add generic Rez/HVIF forensic workflow to Skills V2

- **Decision:** Accept a parameterized `VECTOR:ICON` extractor plus a focused reference for `ncif` recognition and validated `icon2icon` use in canonical `ctf-forensics`.
- **Evidence:** MIT-licensed `hvif-tools` built and converted a benign generated SVG/HVIF sample to SVG and PNG; malformed and truncated payloads were rejected. The generic extractor passed five deterministic parser tests. It extracted the separately archived Pure Poetry resource; conversion succeeded but did not yield a legible answer. Skills V2 strict migration validation passes with no warnings.
- **Limit:** This validates extraction/conversion, not a solve-rate or TTF improvement. A second unrelated archived resource is required to strengthen generalization evidence.

## D-010 — Keep answer-bearing research caches inside the tested deny boundary

- **Decision:** Store shared archive clones and metadata beneath `runs/_research-cache`, include that root in the runner's deny-read profile, and allow each challenge fixture to declare additional private paths and explicit files for the pre-run probe. Probe representative source README/metadata files through direct, symlink and hardlink paths before model execution.
- **Evidence:** The zero-token probe initially showed that `/var/tmp/ctf-racer-research-cache/.../README.md` and `challenge.json` were directly readable; the Codex sandbox also could not install a deny rule for a deep path on the read-only `/var/tmp` mount. After relocating the 5.0 GB NYU clone/cache under `runs/_research-cache` and leaving the former location as a symlink, the actual sandbox denied the canonical path and all eight listed source/verifier probes, including the old alias, through direct/symlink/hardlink attempts. Controller reads still passed. Networking 1 then ran with the expanded isolation result recorded in state.
- **Limit:** Same-UID Codex sandbox policy isolation is host-specific, and the protected root must be maintained as archives are added. Any new answer-bearing cache outside that root must be declared and probed before the model call.
- **Consequence:** The earlier Bricks of Gold attempt is integrity-limited and excluded from SR. The Networking 1 run is the first result using this expanded cache boundary, but one small challenge does not establish generalization.

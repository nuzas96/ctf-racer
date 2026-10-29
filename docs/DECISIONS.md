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

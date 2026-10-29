# Engineering decisions

## D-001 — Preserve autonomous-first baseline

- **Decision:** Keep one persistent primary solver per isolated challenge, Luna Medium baseline, deterministic preflight, one category skill, and independent controller-side flag verification.
- **Evidence:** `PROJECT_STATE.md`; archived clean five-category result 5/5 in one pass; robustness 14/15 across 15 attempts; race 5/5 in 335.15 seconds. The robustness result is a small sample and does not establish unseen-challenge performance.
- **Consequence:** No model escalation or within-challenge parallelism without a controlled, multi-case experiment.

## D-002 — Skills V2 owns reusable solving knowledge

- **Decision:** CTF Racer remains orchestration and execution control; codex-skills remains the canonical method/reference/script layer.
- **Evidence:** Skills V2 README, CATALOG, and ctf-skill-upgrade methodology define category ownership, deduplication, provenance, and validation.
- **Consequence:** Diagnose traces and search canonical skills before adding reusable technique knowledge. Never copy challenge answers into skills.

## D-003 — Do not run the initial model experiment until budgets are enforceable

- **Decision:** Record the real archived challenge gate as blocked for this checkpoint.
- **Evidence:** Runner round limit is globally configured at four, with no per-run CLI override; SDK turn stream has no demonstrated dependable wall-clock or token cap. Two-round compliance alone would not establish bounded resource use.
- **Consequence:** Implement and test per-run round/time/resource controls first. No challenge or model call was made in this checkpoint.

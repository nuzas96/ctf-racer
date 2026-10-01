# CTF Racer Architecture Lock

This document is the implementation guardrail for CTF Racer.

## Core execution model

**One challenge -> one isolated workspace -> one primary autonomous Codex solver thread first.**

The controller should remain lightweight. Its job is orchestration, not solving the challenge itself.

Controller-owned responsibilities:
- challenge intake and workspace isolation;
- deterministic cheap preflight;
- model/thread lifecycle;
- installed-skill routing;
- policy and resource budgets;
- run history and observability;
- independent flag verification;
- benchmark metrics;
- stall detection and escalation control;
- later multi-challenge scheduling/platform integration.

Skill-owned responsibilities:
- `$ctf-solve`: lifecycle, evidence-first iterations, PROGRESS.md, pivots, stuck recovery;
- one primary category skill: domain methodology and focused-reference routing;
- reusable new technique knowledge: canonical codex-skills via `ctf-skill-upgrade`.

## Autonomous-first escalation

Do not spawn multiple solvers by default.

1. Start one autonomous solver.
2. Continue the persistent thread while it makes measurable evidence-backed progress.
3. If a trajectory is conclusively stale or reaches a controller-defined escalation boundary, prefer a fresh independent trajectory before adding handcrafted reasoning logic to CTF Racer.
4. Parallel racing is an escalation strategy for difficult/high-value challenges, not the default for every task.
5. First independently verified flag wins.

The exact escalation budget is not locked until multi-challenge benchmark evidence supports it.

## Anti-overfitting rules

CTF Racer must not contain:
- challenge-specific solution logic;
- per-challenge cribs or expected plaintexts;
- duplicated crypto/web/pwn/forensics methodology already owned by skills;
- controller prompts engineered only to improve one benchmark;
- model or architecture conclusions based on a single stochastic run.

Deterministic preflight may report facts such as file type, hashes, repeated nonces, mitigations, metadata, protocol summaries, or other cheap observations. It must not become a second challenge solver.

## Evidence required for architecture changes

A change to the execution architecture must be justified by a benchmark suite spanning multiple challenges and, where possible, multiple categories.

Single-challenge evidence may:
- identify a bug;
- motivate a diagnostic;
- motivate a reusable skill upgrade.

It must not by itself justify a general architecture redesign.

Track at minimum:
- independently verified solve rate;
- median verified Time-To-Flag;
- all-run elapsed distribution;
- continuation rounds;
- stalls;
- rejected flag candidates;
- skill-routing/proof status.

## Current freeze

Current baseline:
- model: GPT-6 Luna;
- reasoning: medium;
- one autonomous solver first;
- deterministic preflight;
- `$ctf-solve + ONE category skill`;
- independent benchmark flag verification;
- same-thread continuation while progressing;
- no within-challenge multi-agent racing yet.

Current evidence gate: a clean CSAW static-v1 pass has demonstrated 3/3 verified solves across crypto, forensics, and reverse engineering under the frozen architecture. The next gate is broader category coverage with Web + Pwn/service-oriented benchmarks before repeated-run robustness measurement or any escalation/concurrency change.

## Grounded project checkpoint

Read `PROJECT_STATE.md` before proposing architecture or benchmark changes. It records the current official baseline, environment lessons, active suite, and pending Web/Pwn expansion state.

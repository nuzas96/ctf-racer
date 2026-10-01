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

Current evidence gate: the clean five-category CSAW suite has demonstrated 5/5 verified solves across crypto, forensics, reverse engineering, Web, and Pwn. A subsequent three-run-per-challenge robustness sample achieved 14/15 verified (93.3%); the sole failure was diagnosed as a reusable crypto-skill trajectory gap rather than a controller failure.

This evidence justifies the first competition scheduler layer:
- run different challenges concurrently, each with one primary autonomous solver;
- keep same-challenge attempts isolated;
- after a primary failure, allow a bounded fresh independent retry;
- do not default to same-challenge parallel swarms yet;
- first independently verified solve ends that challenge's retry chain.

## Grounded project checkpoint

Read `PROJECT_STATE.md` before proposing architecture or benchmark changes. It records the current official baseline, environment lessons, active suite, and pending Web/Pwn expansion state.


## Competition scheduler

Competition mode is intentionally separate from benchmark mode.

`suite` remains the sequential/repeatable measurement harness so historical benchmark comparisons remain valid.

`race` is the competition scheduler:
- distinct challenges may run concurrently up to a bounded concurrency limit;
- each challenge starts with one fresh primary Codex thread;
- a failed primary may receive a bounded fresh independent retry;
- retries for one challenge are sequential, never concurrent with that challenge's previous attempt;
- live telemetry from all active solvers is prefixed by challenge/attempt;
- race reports are stored separately under `runs/_races/`.

This is the first competition-grade orchestration layer. Same-challenge multi-solver parallel racing remains a later escalation experiment, not a default policy.


## First competition-race validation

The first real five-category race completed 5/5 verified with concurrency 5 and one fresh retry available. All five challenges solved on their primary attempt, so zero retries were consumed. Controller wall time was 335.15 s.

This validates cross-challenge concurrency as a competition optimization under the current architecture. It does not establish that same-challenge parallel racing is beneficial; primary-first plus bounded fresh retry remains the locked within-challenge policy until further evidence.


## Intake boundary

Competition intake is platform-neutral by design.

The core accepts normalized challenge directories containing `challenge.json` plus player artifacts/service metadata. Generic intake discovery validates and queues these directories before solver launch. Platform-specific adapters (for example CTFd or a custom event API) should only fetch/normalize challenges into this format; they must not duplicate routing, solver, retry, verification, or race logic.

This keeps future watcher/platform integrations replaceable while preserving one execution core.

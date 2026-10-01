# CTF Racer — Current Project State

Last grounded: 2026-10-01 (Asia/Kuala_Lumpur)

This file is the compact source-of-truth checkpoint for the current implementation state. Read it together with `ARCHITECTURE.md`, `benchmarks/suite.json`, and the latest master Google Doc section before proposing architecture changes.

## Locked execution architecture

- One challenge -> one isolated workspace -> one primary autonomous Codex solver thread first.
- Model baseline: `gpt-6-luna`, reasoning `medium`.
- Use `$ctf-solve + ONE primary category skill`.
- Controller owns orchestration, isolation, verification, metrics, stalls, and later escalation.
- Skills own solving methodology and focused references.
- No challenge-specific reasoning logic belongs in the controller.
- Multi-agent racing is not the default and is not yet justified by current evidence.
- A single challenge/run must not drive a general architecture redesign.

## Verification and observability

- Model output is only a candidate until independently verified.
- Archived fixtures use controller-side SHA-256 verification.
- Wrong candidates are rejected and the same persistent thread continues.
- `SKILL_PROOF.md` verifies both top-level skills and focused references actually opened.
- Repeat benchmarks persist under `runs/_benchmarks/`.
- Aggregate suites persist under `runs/_suites/`.

## Active benchmark suite

`benchmarks/suite.json` is currently `csaw-static-v1` from `osirislab/CSAW-CTF-2026-Quals-Public`.

It contains:
- Secret Treaties — crypto.
- Ghost in the Machine — forensics/network timing.
- Autobahn — reverse engineering.

Official clean synchronized baseline:
- Secret Treaties: VERIFIED, 2 rounds, 547.79 s.
- Ghost in the Machine: VERIFIED, 1 round, 135.87 s.
- Autobahn: VERIFIED, 1 round, 96.13 s.
- Aggregate: 3/3 verified, 100.0% for this single clean pass.
- Report: `runs/_suites/csaw-static-v1/2026-10-01T10-30-00-120Z.json`.

This is a baseline success, not a robustness estimate. Each final-state challenge has only one run in the clean aggregate pass.

## Environment lessons already confirmed

Crypto:
- Secret Treaties correctly routed to `ctf-crypto/lattice-and-lwe.md`.
- Initial failure was materially caused by missing reliable lattice tooling.
- Installing Kali `python3-fpylll` changed the challenge from unsolved to verified solve.

Forensics:
- Ghost correctly routed through `references/network-pcap.md` and `network-advanced.md`.
- The decisive reusable fix was filter-before-difference: when decoys are interleaved, filter the carrier class first, then compute consecutive carrier timestamps.
- The canonical forensics skill and routing index were updated and validated by GitHub Actions.

Reverse:
- Autobahn solved with the existing reverse stack; `ctf-reverse/tools-dynamic.md` was the focused reference in the clean pass.

## Historical benchmarks

- Meridian Vault Systems {2}: retain for diagnostics only; do not optimize the architecture around it.
- Muse in Disguise: archived fixture definition only; not required by the active suite.

## Next benchmark expansion

Do not keep tuning the three static-v1 challenges.

Next coverage target:
- Web: CSAW 2026 TrustDinOIDC.
- Pwn: CSAW 2026 Diamond Dogs.

Why these candidates:
- TrustDinOIDC is a compact reproducible OIDC/JWT web trust-boundary service.
- Diamond Dogs has explicit player handout files, exact glibc 2.31 runtime, and a local-reproduction Docker definition.

These service-oriented benchmarks are NOT active yet. They require a validated local-service lifecycle and challenge-network path that preserves benchmark isolation. Do not report a five-category solve rate until both are actually wired, checked, and run.

## Current implementation boundary

The current runner can:
- fetch/verify player artifacts;
- precheck suites;
- run static/local-file challenges;
- verify flags;
- persist metrics and reference proof.

A generic local Docker Compose service lifecycle is implemented: controller-side deployment files, per-run dynamic flag and SHA-256 verification, localhost healthchecks, cleanup, and an infrastructure-only smoke command. Both Docker smokes and a non-solving Codex localhost HTTP check passed. Web/Pwn remain outside the active suite; no Web/Pwn solver run or solve-rate claim has been made.

## Decision gate after Web + Pwn

After verified Web + Pwn coverage exists under the same architecture:
1. run a clean five-category aggregate baseline;
2. only then run repeated trials to estimate consistency/variance;
3. inspect failures before considering fresh independent retry;
4. only after evidence supports it, test bounded multi-solver escalation.

Do not jump directly to parallel swarms.


## Invalid pending-run note

On 2026-10-01, the staged TrustDinOIDC and Diamond Dogs definitions were invoked before the service harness existed. TrustDinOIDC stalled without a controller-managed live service; Diamond Dogs was blocked by missing verified artifacts before any model call. Exclude both attempts from benchmark metrics and architecture conclusions. The active official baseline remains csaw-static-v1 at 3/3 verified.


## Web coverage update

TrustDinOIDC: VERIFIED under the frozen architecture after synchronizing the canonical Web skill fix for multi-issuer x5c trust. Final rerun: 1 round, 122.97 s, focused references oauth-oidc.md and jwt.md. The previous valid run was 4 rounds / 817.14 s / unsolved. No controller, model, round-budget, or multi-agent change was required.

Current demonstrated categories: crypto, forensics, reverse, Web, Pwn. Diamond Dogs: VERIFIED on the first valid Pwn service run in 1 round / 370.69 s with focused reference ctf-pwn/heap-techniques.md. The next gate is one clean aggregate pass of benchmarks/suite-five-category.json before repeated-run robustness testing.


## Five-category suite gate

A separate suite definition now exists at `benchmarks/suite-five-category.json` so the historical clean static 3/3 baseline remains reproducible through `benchmarks/suite.json`.

The five-category suite contains:
- Secret Treaties — crypto;
- Ghost in the Machine — forensics;
- Autobahn — reverse;
- TrustDinOIDC — Web;
- Diamond Dogs — Pwn.

All five categories have individually demonstrated verified solves under the frozen autonomous-first architecture. This is not yet an aggregate 5/5 baseline until one clean suite pass succeeds under one synchronized state.


## Official five-category baseline

On 2026-10-01, `benchmarks/suite-five-category.json` completed one clean synchronized aggregate pass under the frozen architecture.

Results:
- Secret Treaties — crypto — VERIFIED — 1 round — 411.36 s.
- Ghost in the Machine — forensics — VERIFIED — 1 round — 277.74 s.
- Autobahn — reverse — VERIFIED — 1 round — 95.09 s.
- TrustDinOIDC — Web — VERIFIED — 1 round — 270.20 s.
- Diamond Dogs — Pwn — VERIFIED — 1 round — 367.83 s.

Aggregate: 5/5 verified, 100.0% for this single clean pass.
Report: `runs/_suites/csaw-five-category-v1/2026-10-01T12-11-45-430Z.json`.

This is now the official broad architecture baseline across Crypto, Forensics, Reverse, Web, and Pwn. It is still not a robustness estimate. Keep the architecture frozen and move next to repeated-run consistency/variance measurement before considering fresh independent retries, stronger model/reasoning, or multi-agent racing.


## Three-run robustness sample

On 2026-10-01, the five-category suite completed three fresh runs per benchmark under the unchanged frozen architecture.

Aggregate: 14/15 verified = 93.3%.

Per category:
- Secret Treaties — crypto — 2/3 verified.
- Ghost in the Machine — forensics — 3/3 verified.
- Autobahn — reverse — 3/3 verified.
- TrustDinOIDC — Web — 3/3 verified.
- Diamond Dogs — Pwn — 3/3 verified.

The sole failure was Secret Treaties run 1: 4 rounds / 723.10 s / unsolved. Runs 2 and 3 solved in one round at 94.64 s and 178.87 s.

Suite report: `runs/_suites/csaw-five-category-v1/2026-10-01T13-24-03-495Z.json`.

Do not rerun the whole suite or change architecture yet. Next gate: zero-token inspection of the failed Secret Treaties archived run. Live agent telemetry is a separate operator-observability improvement and should not alter the solver policy.


## Secret Treaties robustness failure diagnosis

Zero-token inspection of the sole failed attempt in the 14/15 robustness sample showed continuous progress in every round, so stall detection was not the problem. The failed trajectory used weaker/raw subset-sum embeddings plus escalating BKZ, Z3, CVP/Babai, and plaintext-constrained MITM, recovering only the first block before the four-round budget ended.

The successful runs instead used a binary-centered 73-dimensional knapsack embedding with rows `[2I | 2a]` and final row `[1,...,1 | 2t]`, exact weighted-sum verification, modest targeted BKZ, and deterministic reduction-order variants when needed.

This is classified as a reusable skill-methodology/trajectory gap, not a controller architecture failure. Canonical `ctf-crypto/lattice-and-lwe.md` was strengthened in codex-skills commit `7a4bcdaf5fa93eec6253ef4c048ef9c7dda853ee`.

Do not rerun the full 15-attempt suite solely for this patch. Sync the skill, then continue to operator observability/live telemetry before further architecture experiments.


## Live operator telemetry

CTF Racer now uses Codex SDK streamed turn events for operator observability. This change is intentionally policy-neutral: the same persistent thread, prompts, model, reasoning effort, skills, round limits, and verifier behavior remain in place.

The terminal and `runs/<challenge-id>/telemetry.log` now expose redacted/summarized command execution, file changes, todo/progress state, agent messages, tool names, errors, and token usage while a round is running. Reasoning-content events and full command output are not surfaced. Dynamic service flags pass through the existing redactor before display/persistence.

This feature exists so a human operator can distinguish healthy progress from a bad trajectory during live CTF racing without exposing private model reasoning or changing solver behavior.


## Live telemetry local validation

On 2026-10-02, the latest main branch was pulled locally and the full Node test suite passed: 38/38 tests, 0 failures.

The operator then ran `npm run racer -- solve examples/hello-flag` and confirmed the live Codex telemetry path end-to-end. The terminal showed:
- turn start;
- public agent progress messages;
- command start/completion/failure summaries;
- file creation;
- turn token usage;
- telemetry log location.

The smoke challenge solved in one round / 51.13 s with an independently verified flag. Skill proof verified `ctf-solve + ctf-misc` and focused reference `ctf-misc/encodings.md`.

Live telemetry is therefore validated in real local Codex execution, not only through unit tests/CI. It remains observability-only and does not change solver prompts, model/reasoning, skill routing, round policy, or verification.


## Competition race scheduler

The first competition orchestration layer is implemented and CI-validated.

New command:

```bash
npm run racer -- race <suite.json> --concurrency N --fresh-retries N
```

Semantics:
- distinct challenges run concurrently up to the configured cap;
- one primary autonomous solver starts per challenge;
- a failed challenge can receive a bounded fresh independent retry;
- same-challenge attempts remain sequential and isolated;
- live telemetry is challenge/attempt-prefixed;
- competition reports are separate from benchmark reports under `runs/_races/`.

Default policy: `competition_concurrency=5`, `fresh_retry_attempts=1`.

This does not alter the sequential `suite` or `benchmark` measurement harnesses. True same-challenge parallel multi-agent racing is still deliberately deferred.

CI after the scheduler/tests landed: 41 tests, 41 passed, 0 failed.

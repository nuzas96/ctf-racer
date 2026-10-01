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

The current runner does not yet have a validated generic local-service lifecycle in main. Treat service orchestration/network enabling as pending implementation, not completed capability.

## Decision gate after Web + Pwn

After verified Web + Pwn coverage exists under the same architecture:
1. run a clean five-category aggregate baseline;
2. only then run repeated trials to estimate consistency/variance;
3. inspect failures before considering fresh independent retry;
4. only after evidence supports it, test bounded multi-solver escalation.

Do not jump directly to parallel swarms.

# CTF Racer V1

V1 architecture lock:

> **One challenge = one persistent Codex agent = one isolated workspace.**

This milestone intentionally does **not** use multiple agents for the same challenge, difficulty prediction, solve-count heuristics, or automatic CTF platform polling.

## Architecture guardrail

The current execution principles are frozen in [`ARCHITECTURE.md`](ARCHITECTURE.md). General architecture changes require multi-challenge benchmark evidence; one challenge may expose a bug or reusable skill gap, but must not by itself drive a redesign.

## What V1 does

1. Reads a local authorized CTF challenge definition.
2. Creates `runs/<challenge-id>/workspace/`.
3. Copies challenge artifacts into that workspace.
4. Creates `CHALLENGE.md`, `AGENTS.md`, `PREFLIGHT.md`, minimal canonical `PROGRESS.md`, and run state.
5. Runs deterministic category-aware preflight before the Codex agent starts.
6. Routes the solve through the installed **`$ctf-solve` lifecycle skill plus exactly one primary category skill** (for example `$ctf-crypto`) instead of copying skill content into the workspace.
7. Starts one persistent Codex SDK thread with `workspace-write` sandboxing.
8. Rejects advertised flag placeholders and separates extracted candidates from independently verified benchmark flags.
9. Saves responses, run state, timing, skill proof, and prior-run history for benchmarking.

## Requirements

- Node.js 22+ (Node 24 is fine)
- npm
- Codex authentication already working on the machine
- The user's CTF skills installed in Codex

Codex uses progressive skill disclosure: the session initially sees skill names/descriptions and loads the full `SKILL.md` when the skill is selected.

Current Codex skill installs may be visible under repository-scoped `.agents/skills`, user-scoped `$HOME/.agents/skills`, and existing user installs under `$HOME/.codex/skills`; the runner checks both user paths for diagnostics.

## Install

```bash
npm install
cp config/policy.example.json config/policy.json
```

## Smoke test

```bash
npm test
npm run racer -- solve examples/hello-flag
```

Expected flag:

```text
NADI{ctf_racer_v1_smoke_test}
```

## Real benchmark

```bash
npm run racer -- solve benchmarks/meridian-vault-2
```

For this benchmark the flow is:

```text
Meridian Vault Systems {2}
        ↓
deterministic crypto preflight
        ↓
route $ctf-solve + $ctf-crypto
        ↓
Codex loads the installed ctf-solve lifecycle skill and ctf-crypto category skill
        ↓
one persistent GPT-6 Luna agent
        ↓
solve / continuation rounds
```

The runner asks the agent to create `SKILL_PROOF.md` after loading the routed skill. The CLI verifies that the reported `SKILL.md` path exists and prints one of:

```text
[ctf-racer] skill proof: verified
[ctf-racer] skill proof item: $ctf-solve /home/.../.codex/skills/ctf-solve/SKILL.md
[ctf-racer] skill proof item: $ctf-crypto /home/.../.codex/skills/ctf-crypto/SKILL.md
```

or a non-verified status. This is diagnostic evidence for benchmark runs; it does not replace the Codex skill system.

## Challenge directory format

```text
my-challenge/
├── challenge.json
└── files/
    ├── chall
    ├── source.py
    └── capture.pcapng
```

Example:

```json
{
  "id": "event-web-01",
  "title": "Example Web Challenge",
  "category": "web",
  "description": "Challenge text here",
  "flag_format": "FLAG{...}",
  "flag_regex": "FLAG\\{[^}]+\\}"
}
```

## Policy

Edit `config/policy.json`.

V1 defaults:

- authorized CTF only
- external web research: off
- challenge network access: off
- auto-submit: off
- Codex sandbox: `workspace-write`
- approval policy: `never`
- one persistent Codex thread per challenge
- benchmark model: `gpt-6-luna`
- benchmark reasoning effort: `medium`

`max_continuation_rounds` is a runaway/cost guardrail, **not** a difficulty estimate.

## Workspace state

Each run creates:

```text
runs/<id>/
├── state.json
├── run.log
├── response-1.md
├── response-2.md
└── workspace/
    ├── AGENTS.md
    ├── CHALLENGE.md
    ├── PREFLIGHT.md
    ├── SKILL_PROOF.md   # created by Codex when skill routing succeeds
    ├── PROGRESS.md
    ├── artifacts/
    └── solve/
```

Before a fresh solve, the previous run is moved to:

```text
runs/_history/<challenge-id>/<timestamp>/
```

so benchmark traces are preserved.

## Current milestones

- V1: one challenge → one persistent Codex agent
- V1.1: real archived benchmark
- V2A: deterministic crypto preflight
- V2B: **installed Codex skill routing** using the canonical `ctf-solve + ONE category skill` activation model
- V3: **stall detection + same-agent steering**
- V3.1: **repeatable verified benchmark harness**

## Stall detection

After each unsolved round, the runner compares:
- changes to `PROGRESS.md` and files under `solve/`;
- an explicit `CTF_RACER_PROGRESS=...` or `CTF_RACER_STALLED=...` marker;
- response similarity against earlier rounds.

If a round stalls, the **same persistent Codex thread** is steered back through `$ctf-solve`'s evidence-first and stuck-recovery discipline; CTF Racer detects the stall but does not duplicate the recovery methodology. By default, two consecutive stalled rounds stop the run as `STALLED` rather than wasting the remaining continuation budget.

Relevant policy fields:

```json
{
  "stall_similarity_threshold": 0.82,
  "max_consecutive_stalls": 2
}
```

Round-level diagnostics are written into `state.json`.

Current next gate: add validated Web + Pwn/service benchmark coverage before repeated-run robustness testing or any multi-agent/concurrency change. Broader preflight modules, CTFd intake, and dashboarding remain future work.


## Inspect an existing run without calling the model

Use the current saved run to inspect round-level progress/stall diagnostics without spending tokens:

```bash
npm run racer -- inspect benchmarks/meridian-vault-2
```

This prints the run status, timing, stall count, per-round diagnostics, current `PROGRESS.md`, and files created under `solve/`.


## Candidate vs verified flag

CTF Racer now separates model-produced flag candidates from independently verified solves.

- `flag_regex` and `CTF_RACER_FLAG=...` identify a **candidate** only.
- Archived benchmarks and local fixtures can include a controller-side `flag_sha256`. The raw flag is not placed in the agent workspace.
- A candidate whose SHA-256 matches the benchmark hash becomes `SOLVED (verified)`.
- A benchmark candidate that fails verification is recorded under `rejected_candidates` and the **same persistent Codex thread continues** with verifier feedback.
- A live challenge without an independent verifier stops at `CANDIDATE`; later competition-platform submission can become the authoritative verifier when that integration is enabled.

This prevents plausible-looking or truncated flags from being counted as solved benchmarks.


## Repeatable benchmark harness

Use sequential repeat runs to measure architecture consistency before enabling multi-challenge concurrency:

```bash
npm run racer -- benchmark benchmarks/meridian-vault-2 --runs 5
```

The harness requires `flag_sha256` so only independently verified solves count toward solve rate. Each repetition remains one challenge -> one persistent Codex thread; runs are executed sequentially.

The summary records:

- verified solve count and verified solve rate;
- median verified Time-To-Flag;
- median elapsed time across all runs;
- mean continuation rounds;
- total stalls;
- total rejected flag candidates;
- per-run skill-proof status and exit code.

Reports are saved under:

```text
runs/_benchmarks/<challenge-id>/<timestamp>.json
```

Use at least several repeated runs before drawing model or architecture conclusions from stochastic outcomes.


### Inspect the latest benchmark without model calls

After a repeat benchmark, compare the saved traces without invoking Codex:

```bash
npm run racer -- benchmark-inspect benchmarks/meridian-vault-2
```

This reconstructs the runs associated with the latest benchmark report from the current run plus archived histories and prints, for each run:

- status, elapsed time, rounds, stalls, rejected candidates, and skill-proof state;
- per-round progress/stall markers and response similarity;
- a compact summary of canonical `PROGRESS.md`.

Use this before changing prompts, skills, preflight, or model settings after a poor benchmark result.


## Cross-category benchmark suite

The active architecture-validation suite is `benchmarks/suite.json` and uses only public player artifacts from `osirislab/CSAW-CTF-2026-Quals-Public`.

Current static/offline baseline:

- `csaw-secret-treaties` — Crypto / subset-sum;
- `csaw-ghost-in-the-machine` — Forensics / PCAP timing channel;
- `csaw-autobahn` — Reverse Engineering / self-modifying ELF.

Official synchronized clean pass (2026-10-01): **3/3 verified**. This is one clean aggregate pass, not a robustness estimate.

Pending category expansion (not active in `benchmarks/suite.json` yet):

- `csaw-trustdinoidc` — Web / OIDC-JWT trust boundary;
- `csaw-diamond-dogs` — Pwn / glibc 2.31 UAF.

Read `PROJECT_STATE.md` before changing architecture or benchmark scope.

Fetch the exact public player artifacts directly from the canonical CSAW repository:

```bash
npm run racer -- suite-fetch benchmarks/suite.json
```

Every download is checked against its declared byte size and canonical Git blob SHA-1 before it is accepted locally. Raw flags, author solutions, generators, and writeups are not copied into solver workspaces.

Then verify readiness without model calls:

```bash
npm run racer -- suite-check benchmarks/suite.json
```

Run one attempt per challenge:

```bash
npm run racer -- suite benchmarks/suite.json
```

Use `--runs N` only when repeated per-challenge evidence is intentionally needed. Aggregate suite reports are saved under `runs/_suites/<suite-id>/<timestamp>.json`; individual reports remain under `runs/_benchmarks/`.

Historical benchmarks such as Meridian remain available for diagnostics, but they no longer define the active architecture gate by themselves.

## Local service benchmark infrastructure

A challenge may declare a controller-side Docker Compose service. The controller stages only declared deployment files in a temporary directory, creates a fresh runtime flag, starts and healthchecks the localhost service before Codex starts, and removes containers, volumes, and the runtime directory in `finally`. The dynamic flag hash is the independent verifier; the raw flag is excluded from state, reports, logs, and copied player artifacts.

Run infrastructure checks without a solver:

```bash
npm run racer -- service-fetch benchmarks/csaw-trustdinoidc
npm run racer -- service-check benchmarks/csaw-trustdinoidc
npm run racer -- service-smoke benchmarks/csaw-trustdinoidc
npm run racer -- service-check benchmarks/csaw-diamond-dogs
npm run racer -- service-smoke benchmarks/csaw-diamond-dogs
```

The installed Codex SDK uses `networkAccessEnabled` with `workspace-write`; it is enabled only for a service that explicitly requests challenge network access. External web research remains disabled. The active static suite and its official 3/3 baseline are unchanged.

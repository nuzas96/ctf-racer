# CTF Racer V1

V1 architecture lock:

> **One challenge = one persistent Codex agent = one isolated workspace.**

This milestone intentionally does **not** use multiple agents for the same challenge, difficulty prediction, solve-count heuristics, or automatic CTF platform polling.

## What V1 does

1. Reads a local authorized CTF challenge definition.
2. Creates `runs/<challenge-id>/workspace/`.
3. Copies challenge artifacts into that workspace.
4. Creates `CHALLENGE.md`, `AGENTS.md`, `PREFLIGHT.md`, `FINDINGS.md`, and run state.
5. Runs deterministic category-aware preflight before the Codex agent starts.
6. Routes the challenge to the user's **installed Codex skill** (for example `$ctf-crypto`) instead of copying skill content into the workspace.
7. Starts one persistent Codex SDK thread with `workspace-write` sandboxing.
8. Rejects advertised flag placeholders such as `NADI{...}` before marking a run solved.
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
route $ctf-crypto
        ↓
Codex loads the installed ctf-crypto skill
        ↓
one persistent Luna agent
        ↓
solve / continuation rounds
```

The runner asks the agent to create `SKILL_PROOF.md` after loading the routed skill. The CLI verifies that the reported `SKILL.md` path exists and prints one of:

```text
[ctf-racer] skill proof: verified (/home/.../.codex/skills/ctf-crypto/SKILL.md)
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
    ├── FINDINGS.md
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
- V2B: **installed Codex skill routing** (no duplicated manual skill injection)
- V3: **stall detection + same-agent steering**

## Stall detection

After each unsolved round, the runner compares:
- changes to `FINDINGS.md` and files under `solve/`;
- an explicit `CTF_RACER_PROGRESS=...` or `CTF_RACER_STALLED=...` marker;
- response similarity against earlier rounds.

If a round stalls, the **same persistent Codex thread** receives a steering prompt that forbids repeating the same hypothesis or commands and requires a materially different experiment. By default, two consecutive stalled rounds stop the run as `STALLED` rather than wasting the remaining continuation budget.

Relevant policy fields:

```json
{
  "stall_similarity_threshold": 0.82,
  "max_consecutive_stalls": 2
}
```

Round-level diagnostics are written into `state.json`.

Future work: broader preflight modules, multi-challenge concurrency, CTFd intake, dashboarding, and benchmark metrics.


## Inspect an existing run without calling the model

Use the current saved run to inspect round-level progress/stall diagnostics without spending tokens:

```bash
npm run racer -- inspect benchmarks/meridian-vault-2
```

This prints the run status, timing, stall count, per-round diagnostics, current `FINDINGS.md`, and files created under `solve/`.

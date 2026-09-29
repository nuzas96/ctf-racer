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
6. Starts one Codex SDK thread with `workspace-write` sandboxing and keeps that same thread for continuation rounds.
7. Detects `CTF_RACER_FLAG=<flag>` or a configured flag regex.
8. Saves each final agent response and run state for later benchmarking.

## Requirements

- Node.js 22+ (Node 24 is fine)
- npm
- Codex authentication already working on the machine

OpenAI's Codex SDK runs the same Codex harness used by the CLI and supports persistent thread context. The runner uses the locally configured/default Codex model.

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

Expected flag from the harmless local smoke test:

```text
NADI{ctf_racer_v1_smoke_test}
```

## Challenge directory format

```text
my-challenge/
├── challenge.json
└── files/
    ├── chall
    ├── source.py
    └── capture.pcapng
```

Example `challenge.json`:

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

A target can be included later:

```json
{
  "target": {
    "url": "https://ctf.example/challenge-instance"
  }
}
```

The default policy disables challenge network access. Do not enable it unless the competition rules authorize it.

## Policy

Edit `config/policy.json`.

V1 defaults are conservative:

- external web research: off
- challenge network access: off
- auto-submit: off
- Codex sandbox: `workspace-write`
- approval policy: `never`
- one persistent Codex thread per challenge

`max_continuation_rounds` is a cost/runaway guardrail, **not** a difficulty estimate. No point value or solve count is used to decide challenge difficulty.

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
    ├── FINDINGS.md
    ├── artifacts/
    └── solve/
```

Milestone 2A adds deterministic preflight. The first crypto detector identifies repeated nonce/IV use in JSON artifacts and highlights AES-CTR keystream reuse before Codex begins. Future milestones will add broader category preflight, skills retrieval, stall detection, multi-challenge concurrency, CTFd intake, dashboarding, and benchmark metrics.

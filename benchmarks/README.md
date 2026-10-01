# Archived CTF Benchmarks

These are real archived CTF challenges used to measure CTF Racer without tuning the controller to one puzzle.

## Active suite

`benchmarks/suite.json` currently points to the public CSAW CTF 2026 Quals static/offline baseline:

- `csaw-secret-treaties` — crypto;
- `csaw-ghost-in-the-machine` — forensics;
- `csaw-autobahn` — reverse engineering.

Canonical upstream: `osirislab/CSAW-CTF-2026-Quals-Public`.

Only player-facing artifacts are fetched. Ground-truth flags are represented only by controller-side SHA-256 hashes; author solution/writeup files are not placed in the solver workspace.

```bash
npm run racer -- suite-fetch benchmarks/suite.json
npm run racer -- suite-check benchmarks/suite.json
npm run racer -- suite benchmarks/suite.json
```

Fetched artifacts are verified by exact byte size plus the canonical Git blob hash from the upstream repository.

## Fair-run rules

- Each solve starts with a fresh workspace.
- External web research and challenge network access remain off for this static suite.
- Do not add challenge-specific solver logic to CTF Racer.
- Track verified solve rate, TTF, rounds, stalls, rejected candidates, and skill proof.
- Architecture changes require evidence across multiple challenges/categories.

Historical benchmark directories may remain in this repository for diagnostics, but are not automatically part of the active suite.


## Pending service benchmarks

These are staged for the next category-expansion gate but are **not active** yet:

- `csaw-trustdinoidc` — Web / OIDC-JWT trust boundary.
- `csaw-diamond-dogs` — Pwn / glibc 2.31 UAF.

They require a validated local-service lifecycle and challenge-network path before joining `benchmarks/suite.json`. Do not include them in aggregate solve-rate claims until that wiring exists and the fixtures pass precheck/run end-to-end.

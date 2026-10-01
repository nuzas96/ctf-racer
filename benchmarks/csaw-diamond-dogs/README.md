# Diamond Dogs benchmark staging

Canonical upstream: `osirislab/CSAW-CTF-2026-Quals-Public/pwn/diamond-dogs`.

Status: **infrastructure validated; solver run pending**.

Player-facing artifacts are integrity-pinned from upstream:
- `guard-dog`
- `libc-2.31.so`
- `ld-2.31.so`
- local-reproduction `Dockerfile`
- upstream placeholder `flag.txt`

The placeholder flag is intentionally not a valid benchmark answer.

Planned runtime:
- localhost-only TCP service on port 11025;
- exact glibc 2.31 environment;
- per-run dynamic real flag supplied only to the service;
- solver sees only the player handout plus the localhost target;
- independent verification uses the per-run flag hash.

The service smoke passed. The active suite remains unchanged; no solver run has been performed.

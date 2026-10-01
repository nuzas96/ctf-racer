# TrustDinOIDC benchmark staging

Canonical upstream: `osirislab/CSAW-CTF-2026-Quals-Public/web/TrustDinOIDC`.

Status: **infrastructure validated; solver run pending**.

This directory is intentionally not part of the active suite yet. The local service smoke passed; no solver run has been performed. The solver surface should be the local HTTP target plus the challenge description; upstream README solution text and solver files must not be copied into the workspace.

Planned runtime:
- Docker Compose from the upstream `deployment/` tree.
- Localhost-only public port 18990.
- Per-run dynamic flag supplied by the controller/runtime.
- Independent verifier uses only the per-run flag hash.

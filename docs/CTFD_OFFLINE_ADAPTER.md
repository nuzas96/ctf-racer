# Offline CTFd adapter (mock-only)

Status: local snapshot materialization and mocked submission are implemented. No CTFd HTTP client, credential reader, or live submission path exists.

## Existing components reused

- `src/intake.js` recursively validates normalized `challenge.json` directories, artifact manifests, and duplicate local IDs.
- `src/race.js` performs preflight and dispatches one primary attempt per challenge through the existing scheduler; the adapter fixes concurrency to one and fresh retries to zero for its simulation.
- `src/flag.js` independently checks candidate SHA-256 digests in controller memory.
- `src/watch.js` persists platform-neutral queue state and prevents relaunching solved intake entries. No CTFd-specific polling was added.
- `config/policy.json` keeps `auto_submit` false. No setting in the mock adapter can activate real submission.

## Offline interface

`src/ctfd-mock.js` accepts a captured/sanitized CTFd-shaped challenge response, an optional separate per-challenge file-list snapshot (matching CTFd's separate challenge-files endpoint), and attachment bytes already present in a fixture. It validates HTTPS origin and file paths without making requests, maps known categories, writes normalized challenge directories, and keeps a small controller state file for fingerprints and deduplication. Attachments are checked against CTFd SHA-1 metadata when supplied and receive local SHA-256 manifests for normal Racer intake. Challenge ID, description, category, type, update time, and attachment metadata are retained. Answer-, verifier-, and credential-bearing API keys are rejected; only selected public fields are written into solver-readable `challenge.json`.

`runCtfdMockCycle` uses the existing intake and race scheduler and requires an injected solver executor. Tests inject deterministic executors; this path does not create a Codex session. Candidate verification digests and mock expected submissions are passed in controller memory and never written into the normalized workspace or state file. A mock submission is opt-in (`simulateSubmission: true`), occurs only for an independently verified candidate, compares against an in-process mock rule, persists only status/time, and records simulated latency. Repeated unchanged snapshots and solved challenges are suppressed; changed snapshots are re-materialized only when newer than recorded metadata. Adapter-owned directories are the only directories eligible for update, and are replaced as a unit to remove stale files.

Metrics reported separately: intake, queue, injected solver, independent verification, and simulated submission elapsed milliseconds. The injected solver time is not Codex/Luna TTF and is not a challenge benchmark result.

## Current CTFd API mapping and evidence

The official CTFd API reference documents challenge-list `GET /api/v1/challenges`, challenge-file `GET /api/v1/challenges/{challenge_id}/files`, and challenge-attempt `POST /api/v1/challenges/attempt` endpoints. Challenge list fields include ID, name, description, category, type, state and `solved_by_me`; the documented response is wrapped in `success` and `data`. The official API getting-started guide says API requests use an access token in `Authorization: Token ...`. This adapter intentionally does not implement those requests or accept credentials. See the [official CTFd API reference](https://docs.ctfd.io/docs/api/redoc/) and [API access guide](https://docs.ctfd.io/docs/api/getting-started/).

The challenge attempt operation is represented only by an in-process simulation. Current public API documentation and CTFd instances may differ by version/plugins; before any real adapter is designed, capture the authorized instance's version/OpenAPI shape and confirm attachment metadata/response formats. Never point this mock module at a live origin.

## Security boundary and live-integration blockers

- The adapter makes no HTTP/socket calls. URL checks are preflight validation only, not proof of DNS, TLS, proxy, redirect, or egress enforcement.
- No real API credentials or flags are included in fixtures/tests. Input response keys commonly used for secrets/answers are rejected, and the normalized challenge deliberately excludes private data.
- Attachment URLs must resolve to HTTPS on the configured origin under `/files/`; redirect validation requires the same HTTPS origin. These functions are unit-checked, but no redirect is followed.
- No host-scoped solver network boundary is available in the current Codex runtime. Do not enable broad solver networking to reach a CTF platform.
- Before authorized live integration: enforce a platform-host egress allowlist at the transport/runtime boundary, keep credentials in a controller-only secret store, prove solver/child-process denial, validate real platform and attachment schemas, enforce response-size/time limits and redirect policy, implement idempotent/rate-limited submission with explicit operator enablement, and test cleanup/recovery. Keep real submission disabled by default.

## Deterministic validation

Run `npm test`; `test/ctfd-mock.test.js` covers URL/redirect denial, category mapping, attachment integrity, new/unchanged/updated/stale/solved detection, independent verification, default-disabled submission, mock acceptance/rejection, deduplication, and separate timing fields. The end-to-end test uses the actual intake and race modules with a deterministic injected solver, not a model call.

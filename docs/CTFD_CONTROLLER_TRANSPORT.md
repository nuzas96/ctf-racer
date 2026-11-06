# Controller-only CTFd transport

Status: implemented and tested only against loopback TLS fixtures. No real platform connection, credential, or live submission was used.

## Boundary

`src/ctfd-transport.js` owns CTFd network requests in the controller process. It retrieves a challenge list, retrieves each visible challenge's attachment metadata, downloads the attachment bytes, and returns a sanitized snapshot to `src/ctfd-mock.js`. The existing adapter materializes normalized challenge directories and dispatches through the existing intake/race path. The controller wrapper keeps candidate strings in memory, checks them with the controller-held independent digest through the existing adapter, and invokes transport submission only for a verified candidate and only when both submission opt-ins are true.

The transport object and token are never passed to the injected solver callback. `src/race.js` now removes all `CTFD_*` and `CTF_RACER_CTFD_*` environment entries before spawning its solver CLI child. Verifier digests, adapter state, and submission journals belong under `runs/_verifiers` and `runs/_ctfd-controller`, both denied and probed by the Codex solver profile. This is a tested Codex/Linux permission-profile boundary for the current host, not a separate UID/container guarantee.

## Request contract

The current adapter implements this tested CTFd API v1 shape:

- `GET /api/v1/challenges` → `{success:true,data:[challenge...]}`.
- `GET /api/v1/challenges/{decimal_id}/files` → `{success:true,data:[file...]}`.
- Attachment `location` must resolve to the configured HTTPS origin under `/files/`; signed query parameters are allowed for the download request but stripped before normalized intake.
- `POST /api/v1/challenges/attempt` sends `{challenge_id, submission}`. It recognizes CTFd `data.status` strings and the legacy boolean result used by tuple-based challenge plugins. Unknown response shapes are persisted as uncertain and are never automatically retried.

The official API reference documents the challenge list, per-challenge files, and attempt endpoints; the official access guide documents `Authorization: Token <access-token>`. Current CTFd server source also shows the attempt endpoint returns a `data.status` and `data.message` pair, with legacy challenge plugins able to produce boolean verdicts. See [API reference](https://docs.ctfd.io/docs/api/redoc/), [authentication guide](https://docs.ctfd.io/docs/api/getting-started/), and [CTFd challenge API implementation](https://github.com/CTFd/CTFd/blob/master/CTFd/api/v1/challenges.py). The upstream `master` source URL is not a version pin; a real authorized target's version and OpenAPI schema must be recorded and tested before use.

If the challenge-list response reports multiple pages, transport fails with `PAGINATION_UNSUPPORTED` rather than silently ingesting a partial listing. A target that uses pagination, a path-prefixed base URL, another attachment shape, or another attempt verdict schema needs explicit fixture coverage before it is supported.

## Network and data controls

- HTTPS is mandatory; base URL contains only the configured origin. API routes are a fixed allowlist. Attachment requests must remain same-origin and under `/files/`.
- The configured hostname is resolved for each request. Every returned address must match the operator's exact `allowedAddresses` list; the selected address is bound into the connection's custom DNS lookup. The HTTP `Host` and TLS SNI/certificate hostname continue to use the configured hostname.
- TLS certificate-chain and hostname validation remain enabled. A caller may provide a CA bundle for a privately authorized instance; there is no `rejectUnauthorized:false` path.
- Redirects are rejected without following them. This also prevents forwarding the CTFd Authorization header to another origin.
- DNS resolution, HTTP response, and request wall time are bounded. JSON bodies, per-file bytes, aggregate bytes, challenge count, attachment count, and submit body are capped.
- Errors do not include response bodies, headers, signed URLs, request payloads, or credentials. The module emits no request logs.
- No token is read from the environment by the module. It is passed directly to a private class field in the controller. Solver child environments remove CTFd-prefixed names as defense in depth.
- Submission is disabled by default and requires both `submissionEnabled:true` on the client and `submitVerifiedCandidates:true` on the controller cycle. The candidate is independently verified before the POST.
- Before transmission, a mode-0600 journal records only a SHA-256 candidate fingerprint, status and timestamps. An exclusive lock serializes multiple local controller instances. Pending/uncertain results suppress duplicate candidate retries after a crash or lost response. Attempts per challenge are capped and a local interval plus CTFd `Retry-After` is enforced. No automatic retry occurs.

The journal is restricted to a direct child of `runs/_ctfd-controller`, whose root is included in actual sandbox deny probes. It never stores the candidate or API token. Since CTFd has no client-supplied idempotency key on this endpoint, this is local at-most-once behavior per controller journal; it cannot deduplicate submissions made by another machine, user, or independent state store.

## Validation

`test/ctfd-transport.test.js` generates an ephemeral test certificate and runs a local HTTPS CTFd-shaped server. It verifies challenge/file discovery, attachment download and SHA-1 validation through the existing adapter, new/updated/stale snapshots, scheduler execution, independent verifier gating, accepted/rejected/rate-limited statuses, duplicate suppression, request uncertainty recovery, exact DNS/IP pinning, DNS drift denial, TLS trust and hostname failures, redirects, response bounds, pagination fail-closed behavior, credential redaction, solver environment filtering, and submission disabled by default. The end-to-end fixture runs a deterministic solver subprocess; it does not invoke Luna.

The test also executes the actual bundled Codex Linux sandbox probe against local controller credential and verifier canaries while an HTTPS listener is active. Direct/symlink/hardlink reads remain denied and the sandbox cannot reach the listener. This demonstrates the existing host-specific solver boundary; it does **not** enforce controller-process egress at the kernel level.

## Remaining live-connection gate

1. Record explicit authorization and platform automation rules.
2. Pin the platform URL, CTFd version/OpenAPI schema, authentication mechanism and expected response forms.
3. Supply a dedicated controller-only credential through a secret provider; never put it in a solver environment or workspace.
4. Review the exact host/IP allowlist, DNS behavior, TLS roots, certificate renewal and redirect policy. These checks are application-level for this transport; host firewall and process-wide egress remain outside its enforcement.
5. Perform an explicitly authorized read-only discovery smoke test and validate challenge/file schema and attachment integrity.
6. Keep solver network disabled. Network-dependent challenge solving requires a separate local target boundary; do not widen the API client allowlist for solver children.
7. Require separate operator approval before enabling any actual attempt POST. Keep duplicate suppression, attempt caps, rate limiting and uncertain-outcome recovery enabled.

No production CTFd connection is enabled by this checkpoint.

# Latest research report — 2026-11-06 (controller-only CTFd transport)

## Implementation

Added `src/ctfd-transport.js` as a controller-owned client and workflow wrapper around the existing CTFd snapshot adapter, normalized intake, race scheduler, and independent verifier. It retrieves challenge metadata and per-challenge attachment metadata, downloads bytes, validates file hashes through the existing adapter, detects current/stale snapshots there, and submits only candidates independently verified in controller memory.

Transport policy for this client:

- One configured HTTPS origin and fixed API route allowlist.
- Per-request DNS resolution; all answers must be in the configured exact IP set, and the chosen address is pinned into the HTTPS socket lookup. HTTP Host and TLS SNI/hostname verification still use the configured hostname.
- TLS verification remains enabled; redirects are rejected. Request/DNS/snapshot time and JSON, per-file, aggregate artifact, item-count and submit-body sizes are bounded.
- Secret-safe generic errors; token held in a private controller object field and used only in the Authorization header. No request logging.
- Submission false by default and needs two opt-ins. The existing independent verifier gates every candidate. A mode-0600 journal under `runs/_ctfd-controller` plus an exclusive local lock suppresses duplicate submissions and uncertain-result retries after a crash; only candidate hashes/status/timestamps persist. Per-challenge attempt/rate limits apply; transport never retries automatically.
- `src/race.js` removes CTFd-prefixed environment variables from solver child environments. The existing Codex permission profile now denies/probes `runs/_ctfd-controller` with verifier material.

The normal single-primary Luna architecture and model policy are unchanged.

## API contract and limitations

The client follows documented CTFd API v1 routes for challenge list, per-challenge files, and attempt POST. It supports the documented `{success,data}` form, string attempt statuses, and legacy boolean plugin verdicts seen in current CTFd source. It fails closed on multi-page challenge lists and unknown response shapes. Path-prefixed origins and untested target-specific schemas are unsupported. Source research and version caveats are in [`docs/CTFD_CONTROLLER_TRANSPORT.md`](../CTFD_CONTROLLER_TRANSPORT.md); official sources: [CTFd API reference](https://docs.ctfd.io/docs/api/redoc/), [token guide](https://docs.ctfd.io/docs/api/getting-started/), [CTFd challenge API source](https://github.com/CTFd/CTFd/blob/master/CTFd/api/v1/challenges.py).

The client applies application-level restrictions to its own sockets. It does **not** enforce kernel- or process-wide controller egress. Solver networking remains disabled. Local journal locking cannot deduplicate submissions from other machines or separate journals. No real API credential, real platform request, Luna call or live flag submission was used.

## Deterministic validation

A local TLS fixture tests challenge/file discovery, attachment transfer/integrity, snapshot update/stale handling, existing scheduler and verifier integration, accepted/rejected/duplicate/rate-limited submissions, disabled-by-default behavior, uncertain timeout recovery without resend, DNS drift and IP pinning, TLS hostname/trust failures, redirect denial, response caps, pagination fail-closed, environment credential filtering, and private journal constraints. The fixture invokes an actual Codex sandbox isolation probe with controller/verifier canaries while the local HTTPS listener is active. The deterministic solver fixture is a child process; no model was called.

Focused results: transport test `11/11`; transport plus verifier-isolation tests `16/16`. The full CTF Racer suite passed `81/81` (0 failures, 3.70 seconds). `npm run research:status`, JSONL ledger parsing, and `git diff --check` passed. The validation record is appended to `docs/EXPERIMENT_LEDGER.jsonl`.

## Remaining live-connection gate

1. Explicit platform authorization and written automation rules.
2. Exact platform URL, CTFd version/OpenAPI schema, authentication mechanism and expected attachment/attempt response shapes.
3. Dedicated controller-only secret provider and reviewed host/IP/TLS policy.
4. Approved read-only discovery smoke test and bounded artifact download/provenance validation.
5. Separate operator approval before any actual attempt POST; submission stays disabled by default.
6. Separate controls for network-dependent target solving; do not broaden solver networking to reach CTFd.

---

# Latest research report — 2026-11-06 (offline CTFd and Forensics cohort)

## Current outcomes

- Offline CTFd adapter is implemented and pushed in CTF Racer commit `3ce81565806f752a428e52bed81e47da3626e79b`. It reuses existing normalized intake, the single-primary scheduler and independent verifier. Its only submission path is a local in-process mock, opt-in and disabled by default; there is no live API transport, credential or real submission.
- New replacement Forensics challenge `pcapin` from NYU CTF Bench development was preregistered and attempted once after artifact, verifier and actual solver isolation checks passed. Luna Medium used one primary, `ctf-solve + ctf-forensics`, one round, network disabled, max four rounds, wall cap 600s.
- Outcome: **unsolved within the declared budget**. Runner stopped at 599.259s with raw `environment_interrupted / wall_timeout`; no candidate, no verifier acceptance/rejection, and no TTF. Token usage unavailable because the turn was cancelled before the completed-turn usage report. No infrastructure or integrity failure was demonstrated.
- Trajectory: first meaningful PCAP transformation at ~44s; first named framing/XOR hypothesis ~57s. It reconstructed a 23-frame single TCP stream with fixed-size records. A global repeated XOR key yielded valid early PNG chunks but failed complete CRC/DEFLATE checks, and Luna explicitly shifted to per-record seed/mask investigation. That branch remained unresolved at the time cap. The focused `ctf-forensics/references/network-pcap.md` opened at ~35s. The evidence-ranking `ctf-solve/references/triage-routing.md` checklist was available/hash matched but not opened, so checklist adherence was not demonstrated.
- Provenance: NYU archive commit `4c5744f55a31a58e03d6118c9dbb1c18e5bbdfa9`, dataset snapshot `b899e00ae75e9c55a2521ec890125298ca6a4b0e`, GPL-2.0; artifact SHA-256 `869dd78ea6b263d9c864351b9f92bfa954c46fef91fe51a1febb6ab9f4501a41`, pinned Git blob match. The local archive cache worktree was dirty; the artifact was read from the pinned Git object and the cache was not modified. Actual sandbox denied direct/symlink/hardlink probes for 12 source/verifier/cache paths, retained controller verification, and had network disabled/loopback-only.
- Cohort is complete as an observational three-case sample: Reverse `deedeedee` verified at 221.78s; Crypto `onlythisprogram` unsolved at 600s; Forensics `pcapin` unsolved at 600s. Watchword was withdrawn before solver start and remains unattempted. Do not reuse these cases as fresh evaluation and do not claim causal checklist gains or a stable Solve Rate estimate.

## Platform readiness

No live CTFd request or submission was made. The mock adapter passes fixture integration only. Real integration remains gated on a controller-only, tightly scoped API transport (solver remains network-disabled), target-version schema validation, hostname/TLS/DNS and redirect enforcement, download bounds/provenance, private credential custody, idempotent/rate-limited submission and explicit activation. Existing Codex network limitations remain unresolved; do not grant broad solver networking.

## Validation and next priority

The adapter's focused tests passed 9/9; the full CTF Racer suite was rerun after these report changes and passed 70/70 (Node v24.19.0 / NVM npm 11.17.0). Ledger JSONL parsed successfully, `research:status` exited 0, and `git diff --check` passed. The checkpoint validation is appended as `VAL-2026-11-06-PCAPIN-CHECKPOINT`. Next measurable platform milestone: prove with deterministic local mock-server tests that controller transport obeys a configured host allowlist and that solver processes cannot reach it or access credentials, while enforcing redirects, body/time limits and duplicate-safe submit state. No production platform access is authorized by this mock milestone.

---

# Current research report — 2026-11-06 (offline CTFd integration)

## Checkpoint and architecture

CTF Racer resumed on `research/bootstrap-continuity-2026-10-28` at `ce713b3f72f5293e70a883be098c663e4bc405cc`. Luna Medium and one persistent primary solver remain unchanged. Canonical Skills V2 remains at `fe88a1a7c98e9852254c8c9bd01e7b37bcc4ba62`; its worktree, including pre-existing untracked `....`, was left untouched.

## Existing platform capabilities

Platform-neutral recursive intake validates normalized `challenge.json` directories, duplicate local IDs, artifact manifests, and service files. The persistent watch queue avoids relaunching solved entries. The race scheduler dispatches one primary solver per challenge and writes race reports. `verifyFlagCandidate` independently checks controller-held SHA-256 verifier data. `auto_submit` is false. The audit found no CTFd parser, platform identity/update tracking, platform submission transport, or live credential path.

## Offline CTFd adapter milestone

Added `src/ctfd-mock.js` and `docs/CTFD_OFFLINE_ADAPTER.md`. It accepts sanitized local challenge snapshots, separately captured per-challenge file metadata, and fixture attachment bytes. It maps IDs/categories/descriptions/attachments into the existing normalized format, checks supplied attachment hashes, tracks new/updated/unchanged/stale/already-solved cases, then uses existing intake and race with concurrency 1 and zero retries. No platform HTTP or socket request exists.

The integration test injects a deterministic executor through the real intake/race path. The returned candidate is verified in controller memory against an out-of-workspace digest. Optional in-process mock submission defaults off and receives only independently verified candidates; it records simulated acceptance/rejection and latency but does not persist the candidate. Timings are split into intake, queue, injected-solver, independent verification and simulated submission. A deterministic sample (15 ms injected solver delay, 12 ms mock delay) measured intake 4.439 ms, queue 7.084 ms, solver fixture 15.785 ms, independent verification 0.377 ms, and mock submission 12.558 ms. These include local overhead and validate instrumentation only; they are not representative CTF latency, Luna TTF, or a CTF solve result.

## CTFd API research

Official CTFd documentation describes `GET /api/v1/challenges`, `GET /api/v1/challenges/{challenge_id}/files`, and `POST /api/v1/challenges/attempt`; challenge metadata includes ID, name, description, category, type, state and `solved_by_me`. The getting-started guide documents `Authorization: Token ...`. See [CTFd API reference](https://docs.ctfd.io/docs/api/redoc/) and [API access guide](https://docs.ctfd.io/docs/api/getting-started/). No API requests or real flag submissions were made. The target platform version and its precise file response schema remain unknown.

## Validation and limitations

- Focused CTFd adapter tests passed **9/9**.
- Full CTF Racer suite: **70/70 passed** with NVM Node v24.19.0 / npm 11.17.0.
- No model was called and no CTF challenge was attempted in this adapter milestone.
- Same-origin/HTTPS URL checks are pure validation; they do not enforce DNS, TLS, redirects, response limits, or runtime egress. Codex networking remains disabled-or-broad, so live integration is not ready.
- Before connecting: technically scoped host allowlist inherited by subprocesses, controller-only credential custody and solver denial proof, target-version schema validation, bounded downloads, artifact provenance/hash checks, redirect enforcement, idempotent/rate-limited submit behavior, and explicit operator enablement.

## Forensics cohort and next priority

The three-case observational cohort remains 2/3 executed: `deedeedee` was verified in 221.78s; `onlythisprogram` ended unsolved at its declared 600s budget. `Watchword` was withdrawn before solver execution after preparation exposed answer-bearing guidance, and must not be reused. No fresh Forensics replacement was selected or run during adapter development. Next: commit/push this validated offline adapter, then select and preregister a genuinely untouched offline Forensics replacement with artifact and sandbox checks. This does not imply causal checklist benefit.

---

# Prior checkpoint report — 2026-11-06 Crypto cohort



CTF Racer research evidence commit `5728205` and its follow-up checkpoint documentation are committed and pushed to the existing development branch; `git rev-parse HEAD` is authoritative for the current tip. Skills V2 remains at `fe88a1a7c98e9852254c8c9bd01e7b37bcc4ba62`; its pre-existing untracked `....` is preserved.

## Cohort continuation: Crypto case

NYU CTF Bench development Crypto `onlythisprogram` was untouched locally before the run and was pre-registered in `COHORT-2026-10-29-EVIDENCE-RANKING-OBSERVATIONAL-3`. Source commit: `4c5744f55a31a58e03d6118c9dbb1c18e5bbdfa9`, GPL-2.0. The player tarball (679,376 bytes) matched SHA-256 `014c32fe360e962cd08727051a7ff61a7a0f23d638478871f2dfdcbe18539058` and pinned Git blob `feb1ed71463251a177d6de9d0597693440a7fa8d`. The private controller verifier remained separate.

Before the model call, the actual bundled Codex sandbox denied 16 cache/source/writeup/secret/verifier paths by direct, symlink and hardlink probes; controller reads remained available. Network-disabled namespace checks passed. Installed/canonical Skills V2 file hashes matched at `fe88a1a7c98e9852254c8c9bd01e7b37bcc4ba62`.

Conditions: GPT-6 Luna Medium, one persistent solver, `ctf-solve + ctf-crypto`, four rounds, one attempt, no retry/escalation, network off, 600s wall cap. The runner stopped at **599.362s** after four rounds with raw terminal state `environment_interrupted / wall_timeout`. There was no verifier candidate, no verified flag, and no TTF. Because this was the pre-registered time budget, classify its time-bounded outcome as **unsolved within budget**, not an infrastructure defect. Completed-turn usage: 1,921,337 input (1,764,480 cached), 13,943 output and 4,898 reasoning tokens; fourth-turn usage was unavailable after cancellation; cost unavailable.

The first meaningful artifact experiment was about 38s after launch; the explicit 256-byte repeating-XOR hypothesis was recorded about 57s. That construction was supported by the supplied source and output. Per-column English-frequency scoring yielded no coherent plaintext; an apparent aligned cross-file relation and expected binary headers were investigated but not confirmed. Later rounds focused on increasingly specific binary structure without a verified answer. This is one unsolved development observation, not evidence of lower general solve rate or an infrastructure fault. No reusable skill/controller change was accepted.

## Checklist evidence and remaining cohort

Availability (A) was confirmed: installed `ctf-solve`, `ctf-crypto`, and the focused triage-reference files matched canonical hashes before the run. Actual references loaded: `ctf-crypto/stream-ciphers.md` at about 43s. The evidence-ranking reference `ctf-solve/references/triage-routing.md` was **not opened**, and explicit checklist use was not demonstrated (B). Causal effect (C) remains untested. Cohort outcome is 2/3 executed: `deedeedee` solved/verified in 221.78s; `onlythisprogram` unsolved within its budget.

The preregistered Forensics `Watchword` case was not run. Answer-bearing source guidance surfaced in the orchestration session during the local cache audit, so it is withdrawn from the untouched cohort; no solver attempt occurred. A fresh Forensics replacement must be selected and preregistered.

## Platform integration readiness

Live platform/API integration is **not ready** under current egress controls: Codex network is disabled or broad, with no host-scoped allowlist. Offline parsing and mock adapter development can proceed. Before live use, require enforced platform-host egress, controller-only credential custody with solver denial, TLS and redirect validation, artifact hash/provenance checks, and explicit no-submit-by-default behavior. Do not enable networked service challenges under prompt-only restrictions.

## Validation and continuation

CTF Racer tests rerun: 61/61 passed on Node v24.18.0 with NVM npm 11.17.0. `research:status`, ledger JSONL parsing, and `git diff --check` passed. Safe summary: `docs/reports/experiments/EXP-2026-11-06-NYU-ONLYTHISPROGRAM-COHORT-2/summary.json`. Exact continuation point and next measurable tasks are in `docs/HANDOFF.md`.

---

# Current research report — 2026-10-29

## Architecture and checkpoint

CTF Racer remains on the one persistent Luna Medium solver per isolated challenge architecture, with `ctf-solve` plus one category skill and controller-side flag verification. No model or solver-topology change was made. The three-case development cohort is pre-registered; it is observational and cannot establish causal checklist effects.

## Network boundary

The Codex sandbox's network-enabled mode is broader than a localhost target. Its network-disabled execution profile was probed with the actual bundled Codex sandbox: solver and child share a network namespace separate from the host; namespace-specific `/proc/net/dev` shows only `lo`; there are no IPv4 routes or non-loopback IPv6 routes; a controlled runner-host loopback listener is unreachable. A local-only service path is therefore not available. The fresh challenge below was an offline artifact and ran with networking disabled. No host firewall changes or external host probes were made.

## Pwn runtime fixtures and reusable improvements

Two benign local runtime services passed: one ELF32/i386 using `/lib/ld-linux.so.2`, one ELF64/x86-64 using `/lib64/ld-linux-x86-64.so.2`. Both reported glibc 2.42 and target-derived `puts` addresses. Matching symbol values produced page-aligned bases; using the x86-64 offset for the i386 target did not. `file`, `readelf`, `ldd`, `checksec`, and a local request/response harness were used. This supports early ABI/loader/libc provenance checks, but does not validate exploitation or different glibc releases.

Canonical Skills V2 `ctf-pwn` now tells Luna not to infer target libc identity from host `ldd` or debugger state, and to use target-derived resolution only when the leak primitive supports it. The advice is grounded in the fixtures and primary references: [GNU readelf](https://sourceware.org/binutils/docs/binutils.html), [the Linux dynamic-linker manual](https://man7.org/linux/man-pages/man8/ld.so.8.html), and [pwntools DynELF](https://docs.pwntools.com/en/stable/dynelf.html). No solve-rate improvement is claimed.

## Fresh Luna development challenge

NYU CTF Bench development `deedeedee` (CSAW Quals 2016, Reverse), pinned to archive commit `4c5744f55a31a58e03d6118c9dbb1c18e5bbdfa9`, GPL-2.0. The 1,199,421-byte ELF artifact SHA-256 is `57e5cb10df109bf18bc43ee6b6afa49cbaca24f8e733ee27b4091e572056101a`. The answer-bearing metadata and SHA-256 verifier stayed in denied controller paths; actual direct/symlink/proc-root/hardlink probes passed before solver startup, with controller verification retained.

One Luna Medium primary, `ctf-solve + ctf-reverse`, four rounds maximum, 600-second wall limit, one attempt, no retry/escalation, network disabled. The challenge completed in one round and was independently verified at 221.78 seconds. Input usage was 1,180,360 tokens (1,049,600 cached), output 13,640 and reasoning 8,638; cost was unavailable. First artifact triage was about 28 seconds; the first explicit compile-time XOR hypothesis appeared at 91 seconds and its first test at about 99 seconds.

Luna used the challenge description, D symbols, `readelf`, `nm`, `objdump` and a small local extraction script. It corrected a mistaken D array/key interpretation within the supported compile-time XOR path, then inverted and forward-checked all 499 layers against the embedded ciphertext. There were no rejected candidates or unsupported major branches. About 112 seconds went to correcting the initial key-semantics assumption. This is one verified development solve, not a Solve Rate or generalization estimate.

## Checklist exposure and readiness failure

**A — available:** yes. Before the run, installed `ctf-solve`, `triage-routing.md`, and `ctf-reverse` hashes matched the canonical Skills V2 state; the router links to the focused checklist.

**B — used:** not demonstrated. The trace opened only `ctf-reverse/references/tool-readiness.md` at about 44 seconds; it never opened `ctf-solve/references/triage-routing.md` or recorded competing hypotheses. The selected path was strongly supported, so this is not evidence of a missed alternative.

**C — caused improvement:** untested. This run provides no causal evidence.

The reverse readiness helper hit read-only `/var/tmp` while preparing checksec state. The solver continued with binutils. Canonical `ctf-reverse` now uses Python's selected writable temporary directory, and its five benign ELF32 tests passed both locally and inside the actual Codex sandbox, including checksec status when available. Ghidra startup remains untested. The archived executable also lacked execute permission; direct launch failed, while loader-based execution and static analysis remained available.

## Validation and changes

- CTF Racer tests: **61/61 passed** on NVM Node 24.19.0.
- Skills V2 validation: **14 skills / 230 Markdown / 0 errors / 0 warnings**; routing **50/50**, edge regressions **5/5**.
- `ctf-reverse` readiness tests: **5/5 locally and 5/5 inside the actual Codex sandbox**.
- Skills V2 commits pushed on the existing research branch: `8fc26d9` (Pwn runtime provenance), `d1ecf9d` (primary source links), and `fe88a1a` (writable temp root). The pre-existing untracked `....` remains untouched.
- CTF Racer network probe, experiment evidence and checkpoint updates are committed and pushed at `63158bd`; no main branch changes.

## Prior next-priority note — superseded 2026-11-06

The Crypto case `onlythisprogram` was attempted as described above and ended unsolved at its planned wall budget. `Watchword` was withdrawn before solver start after answer-bearing guidance surfaced during audit; preregister a fresh untouched Forensics replacement. Keep the Pwn service challenge gate open until local-only egress can be enforced without changing host-global networking.

Safe experiment record: `docs/reports/experiments/EXP-2026-10-29-NYU-DEEDEEDDEE-HYPOTHESIS-COHORT-1/summary.json`. The ledger is append-only; historical experiment evidence has not been rewritten.

---

# CTF Racer research report — 2026-10-29

## Checkpoint

Resumed CTF Racer at `39164cb6b1e245ee4e8fd6ab633d10090d153275` on `research/bootstrap-continuity-2026-10-28`. Luna Medium and one persistent autonomous solver remain the baseline. No architecture bootstrap, competitor review, large benchmark, or NYU test-split run was repeated.

## Verifier isolation

Added `src/verifier-isolation.js` and runner integration. Before model execution, the runner rejects insecure verifier files/configuration and probes the actual bundled Codex Linux sandbox using a subprocess at the solver's effective UID (1000). The probe denies direct, symlink, `/proc/self/root`, `/proc/<controller pid>/root`, and hardlink access to a verifier canary and actual challenge/auth/verifier paths while confirming controller-side reads remain possible. The Palo Alto run records five protected files with link count one. This is demonstrated Codex path-policy isolation on this host; it is not separate UID/container isolation and needs revalidation after SDK/policy changes.

## HVIF discovery and Skills V2

The public `ncif` signature identifies Haiku Vector Icon Format (HVIF); PRONOM fmt/1791 links it with Haiku and `.rdef` resources. Direct PRONOM fetch returned HTTP 403 in this environment; indexed record content was available. Public MIT [`hvif-tools`](https://github.com/threedeyes/hvif-tools), commit `3789a261230fd6faad0dfda3b7b2743a2d878125`, builds Linux `icon2icon` with CMake/C++ and its vendored/submodule SVG dependencies. The Haiku-specific `iom2hvif` target was disabled; it is not required for universal `icon2icon`.

A benign generated SVG→HVIF→SVG/PNG validation passed; malformed-signature and truncated inputs were rejected without output. A generic Rez parser extracted the Pure Poetry `VECTOR:ICON` resource into a 5,471-byte `ncif` payload and rendered it to SVG/PNG. The image looked abstract and did not provide a readable solve. Canonical Skills V2 added a focused recognition/conversion reference and parameterized helper; tests **5/5**, strict migration validation **0 errors/0 warnings**. This is a tool/methodology validation only, not measured solve improvement. Changes are on `research/ctf-forensics-hvif-2026-10-29`.

## Fresh real challenge attempt

Palo Alto, Reverse, from the GPL-2.0 NYU CTF Bench **development** split at commit `b899e00ae75e9c55a2521ec890125298ca6a4b0e`; artifact SHA-256 `ca2e61a92fd4286941a679e63ac17725af3baad7a214fe193429be59d8b91fe3`. Luna Medium; `$ctf-solve + $ctf-reverse`; one primary attempt, two rounds, zero retries, network off, 240-second wall limit. Storage preflight and actual verifier-isolation test passed. The solver recovered and forward-checked two arithmetic input constraints, but two remained unresolved. Native ELF32 execution needed `qemu-i386` under this host; Ghidra setup/analysis was slow.

**Outcome:** `environment_interrupted / wall_timeout` at 239.823 seconds. No candidate, no independent verification, no TTF, zero rejected candidates. Do not count as a solver failure or SR attempt. One completed turn reported 928,953 input tokens (854,272 cached), 4,537 output (1,349 reasoning); the second turn was aborted before usage reporting. Cost unavailable. No retries/escalation. Safe state, telemetry, progress, skill proof, storage samples and SHA-256 manifest: `docs/reports/experiments/EXP-2026-10-29-NYU-PALO-ALTO/`.

## Tests and changes

- CTF Racer `/home/nuzhmi/.nvm/versions/node/v24.19.0/bin/npm test`: **60/60 passed**.
- Skills V2 HVIF helper: **5/5 passed**; strict validator: **14 skills, 227 Markdown, 0 errors, 0 warnings**.
- Controller changes: verified Codex deny profile, actual sandbox probe and fail-closed model gate; isolated thread avoids legacy sandbox options that override permission profiles.
- Skills changes: generic Rez extractor, focused HVIF reference, route and catalog entry. No challenge-specific answer or constants added.
- Model default and solver topology unchanged. System npm mismatch was not modified.

## Next measurable priority

On a separate development ELF32 sample, measure whether deterministic preflight for emulator/tool availability and Ghidra readiness can preserve useful solve time under a 240-second bound. Then run a fresh category-diverse NYU development challenge after preregistration and another successful isolation probe. Separately validate the HVIF helper on an unrelated `.rdef` or benign public icon sample. No improvement claim is supported by the interrupted single challenge.


## Follow-on tooling validation (2026-10-29)

- Added the canonical `ctf-reverse/scripts/reverse_readiness.py` report and short reference. It covers ELF class/machine/type, dynamic loader presence, protections, QEMU match, debuggers/disassemblers, Java/Ghidra, per-tool timeouts, and never executes the target. Ghidra `-help` is opt-in and runs in a temporary home; its exit status was 1 but the expected headless usage was printed, so readiness was true without project import.
- Benign ELF32 baseline vs helper: 336.4 ms manual subset vs 344.47 ms report (nearly flat; no speedup claim). The added value is consolidated readiness and avoidance of unnecessary heavyweight launch, not faster low-cost triage. Benign native and qemu-i386 probes exited 0 (2.51 ms / 29.44 ms); arbitrary target compatibility remains untested.
- Independent benign HVIF validation used a synthetic `VECTOR:ICON` resource wrapping a separate 142-byte generated payload. Extracted bytes matched exactly; `icon2icon` emitted valid SVG and 128x128 PNG, visually matching the source icon. No challenge was involved.

## Fresh challenge attempt status (corrected below)

The Bricks of Gold run referenced in the preceding checkpoint was stopped after the expanded isolation audit found the answer-bearing archive cache readable through an unprotected path. Its final classification, usage, integrity limitations, and subsequent Networking 1 experiment are recorded in the 2026-10-29 cache-isolation correction section below. The prior in-progress status is superseded.


## 2026-10-29 cache-isolation correction and completed Misc experiment

### Isolation finding and correction

A live zero-token follow-up tested the actual NYU archive cache, which the earlier verifier probe had omitted. The Bricks of Gold README and `challenge.json` were readable by the solver sandbox through their `/var/tmp` paths; the trace does not show those files being read, but capability existed. The single Luna Medium attempt was stopped after four rounds at 396.014s by operator SIGTERM. It had no candidate, no rejected flags, no independent verification, and no TTF. Classify it as an integrity-limited environment interruption, not a solver failure; exclude it from SR. Three completed turns reported 3,039,391 input (2,824,192 cached), 57,386 output and 39,791 reasoning tokens; the interrupted fourth turn's usage is unavailable. See the append-only correction record.

The 5.0 GB NYU archive clones and research snapshots were moved beneath `runs/_research-cache`; the former `/var/tmp/ctf-racer-research-cache` path is now a symlink. The runner denies the protected cache root automatically and supports per-challenge additional private paths and explicit probe files. The actual SDK Codex sandbox probe then denied direct, symlink, and hardlink access to eight archive/source/verifier files while controller reads remained possible. Same UID (1000) is used; this is a host-specific permission-profile boundary, not separate-UID/container isolation. The Bricks challenge is now development-exposed and will not be reused as a fresh evaluation.

### Fresh NYU development challenge

Networking 1 (CSAW Quals 2013, Misc) was pre-registered and run through the regular `solve` pipeline after artifact, storage, and isolation checks. Archive commit `4c5744f55a31a58e03d6118c9dbb1c18e5bbdfa9`; development dataset snapshot commit `b899e00ae75e9c55a2521ec890125298ca6a4b0e`; GPL-2.0; artifact `networking.pcap`, 4,570 bytes, SHA-256 `7072e7e1a42efe6b77bc0a428b5297440f123098143e830c1e9b7c7ae6886165`.

Conditions: `gpt-6-luna`, medium reasoning; one primary thread/attempt; route `$ctf-solve + $ctf-misc`; one round used (four maximum); 600-second wall cap; no retries; challenge network disabled. Verifier isolation passed with archive paths in scope. The solver identified a 59-frame, Telnet-only capture, reconstructed the single conversation, and recovered the client credential submission in frame 41. Controller verification and a separate digest recomputation against the candidate and upstream source answer both passed. **Verified solve: yes. TTF / elapsed: 36.718s.** No rejected candidates. First meaningful artifact test was reached at about 15 seconds. One reported turn: 186,311 input (155,392 cached), 1,988 output and 558 reasoning tokens; cost was not measured. Safe run metadata and redacted telemetry: `docs/reports/experiments/EXP-2026-10-29-NYU-NETWORKING-1/`.

This is one small archived development result, not an SR estimate or evidence of difficult-task generalization. The trajectory used existing PCAP/Telnet inspection methods; no controller or canonical Skills V2 change is justified by this result. Keep it as regression material. The Bricks attempt's speculative cipher analysis does not count as a solving failure.

### Validation, changes and next task

- CTF Racer test suite: **61/61 passed** with NVM npm 11.17.0 / Node v24.18.0, including direct/symlink/hardlink denial of archive material.
- Canonical Skills V2 reverse-readiness helper and independent HVIF conversion results are documented above; Skills V2 changes are committed separately. No Luna model/default or solver topology change.
- CTF Racer changes in this checkpoint: expanded verifier path handling/probes and deterministic regression coverage; durable integrity correction and verified experiment record; state, handoff, queue and roadmap updates.
- Next measurable priority: select a separate untouched NYU development Crypto challenge with a multi-step artifact/hypothesis workflow; pre-register it after confirming the cache deny probe and verifier custody. Keep Bricks of Gold out of fresh evaluation. Do not claim capability improvement from this single Misc solve.

## 2026-10-29 fresh Crypto development experiment — STFU

Selected untouched NYU CTF Bench development challenge `2013f-cry-stfu` (CSAW Finals 2013, Crypto, GPL-2.0). Archive and dataset commits, two player artifact hashes, local source integrity, verifier custody and pre-registered settings are captured in `docs/EXPERIMENT_LEDGER.jsonl`. Before the model call, the actual Codex sandbox subprocess denied direct, symlink, hardlink and `/proc` root reads of 16 source/verifier probe paths. Controller-side verification worked. Storage checks passed.

**Conditions:** GPT-6 Luna Medium; normal CTF Racer pipeline; one persistent primary; `$ctf-solve + $ctf-crypto`; 4 rounds; 900-second wall cap; one attempt; zero retries; no escalation; network disabled.

**Result:** **Unsolved within budget** (normal terminal state, not an infrastructure interruption), four rounds, 418.129 seconds, one rejected candidate, no verified flag and no TTF. First static disassembly/meaningful artifact work began at approximately 16 seconds. Usage across four reported turns: 8,330,514 input (7,955,840 cached), 73,505 output, 48,156 reasoning tokens; cost not measured. Detailed sanitized metadata: `docs/reports/experiments/EXP-2026-10-29-NYU-STFU/summary.json`.

**Trajectory:** Luna identified the encrypted container/LFSR approach, implemented a decryption path, then verified exact round-trip reconstruction of all 25,316 artifact bytes. The plaintext was an ASCII-art banner. The inferred exact answer string did not pass the independent controller verifier. Luna rejected its normalization assumption and used later rounds to verify the plaintext and inspect whether whitespace encoded more data; no separate payload was found. Root cause is answer interpretation / exact format derivation after successful cryptographic recovery, not environment failure. No reusable implementation or Skills V2 change is yet justified by one case. Count as one unsolved development evaluation for a predeclared time-bounded solve-rate metric; do not claim a general SR estimate.

**Next measurable task:** test a generic banner-to-text and exact-answer reasoning workflow on independent benign/development material, including deterministic OCR/font rendering checks. Keep STFU as exposed development analysis only; do not rerun it as a fresh evaluation or store its answer in canonical knowledge.


## 2026-10-29 answer-interpretation research and Cloudb experiment

### Banner interpretation research

A public VuwCTF 2026 forensics writeup documents a custom RLE-to-FIGlet recovery path and confirms transcription by exact re-rendering ([writeup](https://cybersecurityelite.com/ctf-writeups/vuwctf-2026-forensics-writeup/)). The FIGlet manual documents font/layout variability ([man page](https://manpages.debian.org/trixie/figlet/figlet.6.en.html)); pyfiglet is MIT licensed ([repository](https://github.com/pwaller/pyfiglet)). Tesseract's official docs were reviewed; OCR on raw FIGlet character-art was not reliable in our local check. Across three independent benign generated banners and three fonts, candidate re-rendering matched the original while deliberately wrong fonts did not; exact trailing whitespace was retained. This supports keeping raw bytes and comparing candidate renderings, not using OCR as an answer oracle. Canonical Skills V2 `ctf-forensics` gained a focused reference and routing entry; validator: 14 skills, 229 Markdown, 0 errors, 0 warnings. This is method/tool validation, not demonstrated CTF solve gain.

### STFU retrospective

The exposed development trace shows byte-exact LFSR plaintext reconstruction, followed by an unsupported answer-format assumption. The challenge instructions supplied no flag syntax; Luna added a conventional braced wrapper/changed the leading separator, and independent verification rejected that assumption. STFU was not rerun. Generalizable lesson: keep recovered text, candidate representation and verified answer distinct; infer wrappers only from public instructions or evidence; use verifier rejection to invalidate the formatting hypothesis. No answer was copied into skills or this report.

### Fresh NYU Web evaluation: Cloudb

One fresh development attempt used the pinned NYU CTF Bench Cloudb Web source, Luna Medium, one primary solver, `ctf-solve + ctf-web`, one focused LFI reference, four rounds and a 600-second cap. Artifact SHA-256 and provenance are in the append-only ledger; actual sandbox isolation passed, controller verifier metadata matched the pinned source, and the local service had explicit container bounds and loopback-only access. The solver reached unauthenticated path traversal / arbitrary file read at ~24s. However, DB-dependent login, registration and weather JSONP all returned the same PDO connection error although a MySQL listener and socket existed. Run ended normally at 293.361s, four rounds, no candidate; classify `ENVIRONMENT_LIMITED_UNSOLVED`, not an ordinary solver failure, and exclude from SR. No TTF. Usage: 6,142,786 input (5,816,704 cached), 60,568 output, 32,171 reasoning; cost unavailable. Root cause of PDO failure is unresolved. Service healthcheck was too shallow; no generalized implementation change accepted from this one fixture. Safe summary: `docs/reports/experiments/EXP-2026-10-29-NYU-CLOUDB/summary.json`.

### Validation and next priority

CTF Racer tests: **61/61 passed** with NVM npm 11.17.0 / Node v24.19.0. `research:status` and JSONL parsing passed before this checkpoint update; ledger records are append-only. Skills V2 validator: **14 skills, 229 Markdown, 0 errors, 0 warnings**; pre-existing untracked `....` remains untouched. Next: zero-token diagnosis of Cloudb's application-to-MySQL configuration and functional readiness, while selecting a separate fresh archived Reverse/Pwn/Web evaluation. Do not rerun Cloudb as fresh or claim an SR gain from these results.


### Checkpoint commits

- Skills V2 banner recovery guidance: `2ff88e1` on `research/ctf-forensics-hvif-2026-10-29`, pushed.
- CTF Racer Cloudb diagnosis corrections, the fresh Reverse preregistration/result and this report are recorded on `research/bootstrap-continuity-2026-10-28`; no controller code changed.


## Cloudb diagnosis correction and next fresh Reverse gate (2026-10-29)

Deterministic diagnosis found the Cloudb DB fault: Compose passed literal quote wrappers in the MYSQL_PASS environment item, MySQL user setup logged SQL syntax errors, and the archived database setup uses invalid quoted `database`.`wildcard` GRANT scope syntax. A temporary adapted Compose removed only the env quote wrappers on a separate loopback port, but the initializer still emitted SQL syntax errors; the temporary stack was cleaned. Original liveness GET returned 200 while login failed at DB initialization. The unauthenticated LFI separately retrieved the 2,683-byte application SQL backup with valid SQL dump markers; no raw body or answer is in tracked records. Luna's saved trajectory never attempted `db.sql.bak`. Therefore the deployment defect is real, but the evidence does not show it blocked all routes; append-only correction reclassifies Cloudb as ordinary solver-unsolved within budget, eligible for the time-bounded SR sample. No generic readiness code is changed from one service.

Fresh NYU development Reverse case `return-of-the-weiner` is preregistered: standalone Intel HEX, 36,460 bytes; SHA-256 `15c3703a4b8f5f67d2e67fb9d28cc4e466a80fd70ffb7221f0cfba576ee0d2e7`; archive commit `4c5744f55a31a58e03d6118c9dbb1c18e5bbdfa9`; development snapshot `b899e00ae75e9c55a2521ec890125298ca6a4b0e`; GPL-2.0. All 832 record checksums and Git object hash passed, AVR/Intel HEX tooling is installed, no service/network is needed. Controller verifier digest was matched without outputting the source answer. Actual Codex sandbox denied local controller config and upstream challenge/test-solver probes via direct, symlink and hardlink paths. CTF Racer intake/storage checks passed. Conditions are one Luna Medium solver, `ctf-solve + ctf-reverse`, four-round maximum, 600-second limit, no retries/escalation. The preregistered attempt subsequently completed; see the result section below.


## 2026-10-29 deterministic Cloudb diagnosis and fresh Reverse evaluation

### Cloudb diagnosis

The archived Cloudb DB setup is misconfigured with high confidence. The original Compose environment item supplied literal quote characters around `MYSQL_PASS`; a container probe confirmed this, and MySQL user setup logged syntax errors. The archived setup script also contains invalid GRANT scope quoting. A temporary separate Compose adaptation removed only the env quote wrappers and was cleaned up, but an initializer syntax error remained, so no repaired benchmark fixture was accepted. The original root URL returned HTTP 200 while DB-backed login failed; liveness was not readiness. Crucially, the already demonstrated path traversal could read the 2,683-byte SQL backup with valid dump markers. Luna never attempted that path, so the service defect is not shown to block all solve routes. Append-only correction changes Cloudb to `SOLVER_UNSOLVED_WITHIN_BUDGET` and includes it in the time-bounded solve-rate observation. No generic service-readiness controller change is justified from one service; the exact diagnosis and evidence are in the ledger. No backup contents or answer were copied into reports.

### Fresh NYU Reverse result

`return-of-the-weiner` (CSAW Finals 2014, NYU CTF Bench development, GPL-2.0) was pre-registered and run once. Source artifact: one Intel HEX file, 36,460 bytes, SHA-256 `15c3703a4b8f5f67d2e67fb9d28cc4e466a80fd70ffb7221f0cfba576ee0d2e7`; archive commit `4c5744f55a31a58e03d6118c9dbb1c18e5bbdfa9`, dataset snapshot `b899e00ae75e9c55a2521ec890125298ca6a4b0e`. All 832 record checksums and the pinned Git object matched. The actual Codex sandbox isolation probe denied source metadata, reference solver and local verifier metadata via direct/symlink/hardlink access; controller verification remained available.

Conditions: Luna Medium, one persistent solver, `ctf-solve + ctf-reverse`, four rounds, 600s wall bound, no retry/escalation, no network/service. **Independently verified solve: yes; TTF and elapsed 572.671s; four rounds; zero rejected candidates.** First artifact inspection ~10s, disassembly ~21s. The solver initially spent three rounds on an unvalidated AVR bootloader overflow/indirect-call theory. In round four it pivoted to application GPIO writes/delays, extracted a sampled output sequence and submitted a candidate that passed the independent controller digest. No emulator was installed; the overflow branch remains unvalidated and was not needed for the solve. Four reported turns: 9,974,669 input (9,372,160 cached), 155,955 output, 120,285 reasoning tokens; cost not measured. No answer appears in this report. Safe evidence: `docs/reports/experiments/EXP-2026-10-29-NYU-WEINERS/summary.json`.

### Improvements and next step

No reusable code/skill change accepted from one MCU example. The trajectory supports a testable hypothesis that explicit GPIO/LED output tracing can expose answer data even when no simulator is available, but it needs at least two independent benign AVR fixtures before adding permanent methodology. No functional service readiness change was made for Cloudb because its repair is challenge-specific and its LFI route remained available. Next measurable priority: build or obtain two benign AVR firmware samples with known GPIO messages, validate static signal extraction, then decide whether a small `ctf-reverse` reference/script is supported. Do not reuse the solved challenge as a fresh evaluation.


### Validation and checkpoint

- CTF Racer: **61/61 tests passed** on Node v24.19.0 / NVM npm 11.17.0. No controller code changed.
- Skills V2: **14 skills, 229 Markdown files, 0 errors, 0 warnings**. No Skills source change was needed; untracked `....` is preserved.
- `research:status`, complete experiment-ledger JSONL parsing and `git diff --check` passed. Answer-free experiment summaries and append-only Cloudb classification correction are committed on the existing Racer branch; no main merge was made.


## 2026-10-29 evidence-ranked solving and fresh Pwn evaluation

### Fresh challenge result

NYU CTF Bench development `CSAW 2016 Tutorial` (Pwn; source commit `4c5744f55a31a58e03d6118c9dbb1c18e5bbdfa9`, Apache-2.0) ran once through CTF Racer with Luna Medium. The pinned player ELF was 10,576 bytes; hash and Git object are in the experiment ledger. The local Ubuntu 14.04 service was reconstructed from the archived binary and flag file with matching user/permission setup; the challenge program was unchanged. Menu and manual interaction passed a functional preflight. The solver used one persistent primary, `ctf-solve + ctf-pwn`, focused `overflow-basics.md`, four rounds max, one attempt, 750s, no retry/escalation.

The controller independently verified the candidate against its protected digest. **Result: solved; one round; elapsed/verified TTF 411.937s; zero rejected candidates.** First artifact triage was ~13s and the first meaningful service experiment ~35s. Luna established a practice-handler over-read and canary/address leak, corrected a menu-state protocol error, rejected a host-libc offset after its implied base was inconsistent, then resolved the target symbol dynamically. Usage: 2,509,244 input (2,406,016 cached), 35,444 output, 25,949 reasoning tokens; cost not measured. No answer is included in this report. Safe result: `docs/reports/experiments/EXP-2026-10-29-NYU-TUTORIAL-RESULT/summary.json`.

### Verifier isolation and service limitation

Inspection found controller-copied service build files in a random `/tmp` runtime were not in the pre-solver denylist. CTF Racer now adds temporary service/secret roots and their actual files to the deny profile and isolation probe. The live solver run passed direct, symlink, proc-root and hardlink denial on 13 source/controller/runtime files, with controller verification available. Regression tests cover this path. The Codex network permission is boolean, not host-scoped; the solver was instructed to access only loopback, and no external host was contacted. Treat host-scoped egress as an unresolved safeguard before future network-enabled service evaluations.

### Reusable reasoning and AVR validation

Retrospective Return of the Wieners and Cloudb traces suggest a shared missed-observable-evidence pattern: an unvalidated complex branch consumed multiple rounds while a directly observable channel remained untested. The fresh Tutorial trajectory also rejected an incompatible host-libc assumption after a discriminating address-base check. A small `ctf-solve` checklist now compares concrete clue, cheapest discriminator, expected information gain, cost, and disconfirmation while keeping evidence-supported complex paths eligible. These observations do **not** establish causal TTF or solve-rate improvement; measure the approach across at least three untouched development cases.

Two independent benign ATmega328P firmware examples passed static recovery with avr-gcc/avr-objdump and no emulator: one MSB-first active-high fixed-delay stream and one LSB-first active-low variable-delay stream. Both reconstructed byte sequences matched separate known outputs. Added a focused `ctf-reverse` reference with datasheet/binutils/avr-libc sources, false-positive guidance and explicit limits; no automatic decoder was added. See ledger `EXP-2026-10-29-AVR-GPIO-STATIC-VALIDATION`.

### Tests, limits and next task

- CTF Racer tests: **61/61 passed** with NVM Node 24.19.0.
- Skills V2: **14 skills, 230 Markdown, 0 errors/warnings**; routing **50/50**, edge regressions **5/5**.
- An earlier Hungman candidate was withdrawn before model use after its empty-input startup signaled and metadata showed a network service requirement; it is not a benchmark result.
- The Tutorial evaluation is a single development solve, not an SR/generalization estimate. Network permission was broader than the local target, though only that target was used.

**Next priority:** Validate target-libc/runtime compatibility and target-side symbol resolution on two benign local Pwn services; enforce local-only egress, then preregister a fresh challenge and measure hypothesis-checklist adherence and time to first useful test.


Checkpoint commits: CTF Racer `b310d33` and Skills V2 `ec1ea52`, both pushed to their existing development branches. No main branch was changed.

**Methodology exposure correction:** The Tutorial run started before the new `ctf-solve` checklist was synchronized into the installed skill path. It is not evidence that the checklist caused its progress or solve. The installed skill is now synchronized for future runs.

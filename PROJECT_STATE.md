# CTF Racer — Current Project State

Last grounded: 2026-10-29 (America/New_York). Historical benchmark evidence below is dated 2026-10-01.

This file is the compact source-of-truth checkpoint for the current implementation state. Read it together with `ARCHITECTURE.md`, `benchmarks/suite.json`, and the latest master Google Doc section before proposing architecture changes.

For session continuation, also read `docs/HANDOFF.md` and `docs/reports/LATEST.md`. Research milestones, open questions, decisions, and append-only experiment evidence live in their respective files under `docs/`; do not duplicate the ledger here.

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

A generic local Docker Compose service lifecycle is implemented: controller-side deployment files, per-run dynamic flag and SHA-256 verification, localhost healthchecks, cleanup, and an infrastructure-only smoke command. Both Docker smokes and a non-solving Codex localhost HTTP check passed. Web/Pwn remain outside the active suite; no Web/Pwn solver run or solve-rate claim has been made.

## Decision gate after Web + Pwn

After verified Web + Pwn coverage exists under the same architecture:
1. run a clean five-category aggregate baseline;
2. only then run repeated trials to estimate consistency/variance;
3. inspect failures before considering fresh independent retry;
4. only after evidence supports it, test bounded multi-solver escalation.

Do not jump directly to parallel swarms.


## Invalid pending-run note

On 2026-10-01, the staged TrustDinOIDC and Diamond Dogs definitions were invoked before the service harness existed. TrustDinOIDC stalled without a controller-managed live service; Diamond Dogs was blocked by missing verified artifacts before any model call. Exclude both attempts from benchmark metrics and architecture conclusions. The active official baseline remains csaw-static-v1 at 3/3 verified.


## Web coverage update

TrustDinOIDC: VERIFIED under the frozen architecture after synchronizing the canonical Web skill fix for multi-issuer x5c trust. Final rerun: 1 round, 122.97 s, focused references oauth-oidc.md and jwt.md. The previous valid run was 4 rounds / 817.14 s / unsolved. No controller, model, round-budget, or multi-agent change was required.

Current demonstrated categories: crypto, forensics, reverse, Web, Pwn. Diamond Dogs: VERIFIED on the first valid Pwn service run in 1 round / 370.69 s with focused reference ctf-pwn/heap-techniques.md. The next gate is one clean aggregate pass of benchmarks/suite-five-category.json before repeated-run robustness testing.


## Five-category suite gate

A separate suite definition now exists at `benchmarks/suite-five-category.json` so the historical clean static 3/3 baseline remains reproducible through `benchmarks/suite.json`.

The five-category suite contains:
- Secret Treaties — crypto;
- Ghost in the Machine — forensics;
- Autobahn — reverse;
- TrustDinOIDC — Web;
- Diamond Dogs — Pwn.

All five categories have individually demonstrated verified solves under the frozen autonomous-first architecture. This is not yet an aggregate 5/5 baseline until one clean suite pass succeeds under one synchronized state.


## Official five-category baseline

On 2026-10-01, `benchmarks/suite-five-category.json` completed one clean synchronized aggregate pass under the frozen architecture.

Results:
- Secret Treaties — crypto — VERIFIED — 1 round — 411.36 s.
- Ghost in the Machine — forensics — VERIFIED — 1 round — 277.74 s.
- Autobahn — reverse — VERIFIED — 1 round — 95.09 s.
- TrustDinOIDC — Web — VERIFIED — 1 round — 270.20 s.
- Diamond Dogs — Pwn — VERIFIED — 1 round — 367.83 s.

Aggregate: 5/5 verified, 100.0% for this single clean pass.
Report: `runs/_suites/csaw-five-category-v1/2026-10-01T12-11-45-430Z.json`.

This is now the official broad architecture baseline across Crypto, Forensics, Reverse, Web, and Pwn. It is still not a robustness estimate. Keep the architecture frozen and move next to repeated-run consistency/variance measurement before considering fresh independent retries, stronger model/reasoning, or multi-agent racing.


## Three-run robustness sample

On 2026-10-01, the five-category suite completed three fresh runs per benchmark under the unchanged frozen architecture.

Aggregate: 14/15 verified = 93.3%.

Per category:
- Secret Treaties — crypto — 2/3 verified.
- Ghost in the Machine — forensics — 3/3 verified.
- Autobahn — reverse — 3/3 verified.
- TrustDinOIDC — Web — 3/3 verified.
- Diamond Dogs — Pwn — 3/3 verified.

The sole failure was Secret Treaties run 1: 4 rounds / 723.10 s / unsolved. Runs 2 and 3 solved in one round at 94.64 s and 178.87 s.

Suite report: `runs/_suites/csaw-five-category-v1/2026-10-01T13-24-03-495Z.json`.

Do not rerun the whole suite or change architecture yet. Next gate: zero-token inspection of the failed Secret Treaties archived run. Live agent telemetry is a separate operator-observability improvement and should not alter the solver policy.


## Secret Treaties robustness failure diagnosis

Zero-token inspection of the sole failed attempt in the 14/15 robustness sample showed continuous progress in every round, so stall detection was not the problem. The failed trajectory used weaker/raw subset-sum embeddings plus escalating BKZ, Z3, CVP/Babai, and plaintext-constrained MITM, recovering only the first block before the four-round budget ended.

The successful runs instead used a binary-centered 73-dimensional knapsack embedding with rows `[2I | 2a]` and final row `[1,...,1 | 2t]`, exact weighted-sum verification, modest targeted BKZ, and deterministic reduction-order variants when needed.

This is classified as a reusable skill-methodology/trajectory gap, not a controller architecture failure. Canonical `ctf-crypto/lattice-and-lwe.md` was strengthened in codex-skills commit `7a4bcdaf5fa93eec6253ef4c048ef9c7dda853ee`.

Do not rerun the full 15-attempt suite solely for this patch. Sync the skill, then continue to operator observability/live telemetry before further architecture experiments.


## Live operator telemetry

CTF Racer now uses Codex SDK streamed turn events for operator observability. This change is intentionally policy-neutral: the same persistent thread, prompts, model, reasoning effort, skills, round limits, and verifier behavior remain in place.

The terminal and `runs/<challenge-id>/telemetry.log` now expose redacted/summarized command execution, file changes, todo/progress state, agent messages, tool names, errors, and token usage while a round is running. Reasoning-content events and full command output are not surfaced. Dynamic service flags pass through the existing redactor before display/persistence.

This feature exists so a human operator can distinguish healthy progress from a bad trajectory during live CTF racing without exposing private model reasoning or changing solver behavior.


## Live telemetry local validation

On 2026-10-02, the latest main branch was pulled locally and the full Node test suite passed: 38/38 tests, 0 failures.

The operator then ran `npm run racer -- solve examples/hello-flag` and confirmed the live Codex telemetry path end-to-end. The terminal showed:
- turn start;
- public agent progress messages;
- command start/completion/failure summaries;
- file creation;
- turn token usage;
- telemetry log location.

The smoke challenge solved in one round / 51.13 s with an independently verified flag. Skill proof verified `ctf-solve + ctf-misc` and focused reference `ctf-misc/encodings.md`.

Live telemetry is therefore validated in real local Codex execution, not only through unit tests/CI. It remains observability-only and does not change solver prompts, model/reasoning, skill routing, round policy, or verification.


## Competition race scheduler

The first competition orchestration layer is implemented and CI-validated.

New command:

```bash
npm run racer -- race <suite.json> --concurrency N --fresh-retries N
```

Semantics:
- distinct challenges run concurrently up to the configured cap;
- one primary autonomous solver starts per challenge;
- a failed challenge can receive a bounded fresh independent retry;
- same-challenge attempts remain sequential and isolated;
- live telemetry is challenge/attempt-prefixed;
- competition reports are separate from benchmark reports under `runs/_races/`.

Default policy: `competition_concurrency=5`, `fresh_retry_attempts=1`.

This does not alter the sequential `suite` or `benchmark` measurement harnesses. True same-challenge parallel multi-agent racing is still deliberately deferred.

CI after the scheduler/tests landed: 41 tests, 41 passed, 0 failed.


## First real five-category competition race

The first real `race` execution across `benchmarks/suite-five-category.json` completed successfully with:

- concurrency: 5;
- fresh retries available: 1 per challenge;
- verified challenges: 5/5;
- verified challenge rate: 100.0%;
- total solver attempts: 5;
- fresh retries actually consumed: 0;
- wall elapsed: 335.15 s.

Every category solved on its primary autonomous agent:
- Secret Treaties / Crypto — 127.70 s;
- Ghost in the Machine / Forensics — 259.75 s;
- Autobahn / Reverse — 103.41 s;
- TrustDinOIDC / Web — 167.39 s;
- Diamond Dogs / Pwn — 309.80 s.

Race report:
`runs/_races/csaw-five-category-v1/2026-10-01T16-39-30-586Z.json`.

The sum of per-challenge elapsed times was about 968.05 s, versus 335.15 s controller wall time, giving about 2.9x effective wall-clock compression from overlapping work within this race.

Interpretation:
- cross-challenge concurrency is now empirically validated;
- primary-first incurred zero retry cost in this race;
- live telemetry remained usable under five concurrent solvers;
- this does NOT validate same-challenge parallel swarms;
- same-challenge racing remains a later escalation experiment only if future evidence shows fresh-retry latency is too costly.


## Generic competition intake layer

A platform-neutral intake layer is now implemented.

Commands:

```bash
npm run racer -- intake-check <challenge-root>
npm run racer -- intake <challenge-root> --concurrency N --fresh-retries N
npm run racer -- race-status <suite-or-intake.json>
```

`intake-check` is a zero-token dry run that performs discovery and readiness checks without launching Codex.

Intake behavior:
- recursively discovers challenge directories containing `challenge.json`;
- validates challenge definitions plus local artifact/service readiness before model calls;
- rejects duplicate challenge IDs;
- writes a generated manifest under `runs/_intake/`;
- feeds the normalized challenge set into the existing concurrent `race` scheduler.

`race-status` is a zero-token operator view that reads current state and latest telemetry for each challenge in a suite/intake manifest.

This intentionally does not add a CTFd-specific watcher yet. Platform adapters should remain thin producers of normalized challenge directories so the solver core stays platform-independent.

CI after intake/status tests landed: 44 tests, 44 passed, 0 failed.


## Continuous competition watch queue

A persistent platform-neutral watch scheduler is now implemented.

Commands:

```bash
npm run racer -- watch <challenge-root> --concurrency N --fresh-retries N --poll-ms N
npm run racer -- watch-status <challenge-root>
```

The queue state machine is:
`waiting -> queued -> running -> solved|failed`.

Key behavior:
- partial/incomplete challenge directories remain waiting until artifact/service readiness passes;
- ready challenges auto-dispatch when a concurrency slot is free;
- concurrency remains across distinct challenges;
- same-challenge fresh retry remains sequential;
- conflicting active local service ports do not overlap;
- queue state persists under `runs/_watch/`;
- restarting the watcher does not relaunch already solved challenges;
- watch-status is zero-token.

This is the platform-independent continuous competition foundation. No CTFd-specific solver logic has been added.

CI after watcher tests landed: 47 tests, 47 passed, 0 failed.


## 2026-10-28 continuity checkpoint

The source-of-truth files, research queue, decision log, append-only experiment ledger, handoff, and readable latest report were added on feature branch `research/bootstrap-continuity-2026-10-28`. No source logic or canonical skills were modified.

At this 2026-10-28 checkpoint, the real archived challenge gate was deferred. On 2026-10-29, the prior assumption that the PCAP was absent was corrected: it was present under `files/capture.pcap` and validated against the manifest. One Luna Medium attempt was made and stopped unsolved after `/tmp` exhaustion; full result is in the latest report and append-only ledger.

At the prior checkpoint validation was 47/47. Current validation is 49/49 with the NVM npm path; system `/usr/bin/npm ls` still fails because of its system LRU dependency mismatch. Do not treat the previously requested 48/48 as confirmed.


## 2026-10-29 research and regression update

External architecture review covered Veria Labs `ctf-agent`, NYU `nyuctf_agents`, NYU CTF Bench, Cybench, and CTF-Dojo. See `docs/RESEARCH_QUEUE.md` for source URLs, licenses, primary evidence, and adoption decisions. NYU dataset source commits are pinned; the 57-case development JSON conflicts with the repository README's stated 55.

The archived Ghost regression ran one Luna Medium primary attempt with a per-run two-round cap, no retries, network disabled, and a 900-second external wall cap. It was externally stopped at 365s after the workspace could not create temporary files. One model turn reported 766,097 input tokens (712,064 cached), 6,115 output and 2,495 reasoning tokens; no candidate or verified solve was produced. `/tmp` tmpfs was at 100%, due to two research-created full NYU benchmark clones (~5.1 GB) placed there. Root cause is this session's research setup, not demonstrated CTF Racer or challenge-method failure. The original PCAP is unchanged; only the solver workspace copy was repaired.

System `/usr/bin/npm` error is in the system npm dependency stack: `/usr/share/nodejs/hosted-git-info/lib/index.js:8` constructs `LRU`, but system `lru-cache` 11.2.7 exports an object containing `LRUCache`. NVM npm 11.17.0 works for `npm ls` and `npm test`; no project/global dependency was upgraded.

Per-run `--max-rounds N` is now supported for `solve`; it only lowers the configured maximum. Full suite: 49/49 passed using NVM npm. A second fixture, NYU development Forensics “Pure Poetry,” is prepared at ignored local path `local-challenges/nyu-dev-2016-pure-poetry`, pinned to commit `b899e00...`, with private raw answer isolated and zero-token artifact/preflight checks passed. Next priority: disk-space preflight and integrated timeout/cancellation state cleanup. Do not rerun Ghost as tuning data.


## 2026-10-29 resource-control and development-attempt checkpoint

CTF Racer now preflights actual `os.tmpdir()` and workspace filesystems with `statfs`, reserves at least 128 MiB on each distinct filesystem plus workspace artifact-copy overhead, and samples available space every 2 seconds during `solve`. Samples are recorded under `runs/_storage/`. `solve` accepts `--timeout-seconds N` (1–3600, default 900); SIGINT/SIGTERM, wall timeout, and low storage abort the Codex SDK streamed turn using its supported `AbortSignal`. Interrupted runs persist `environment_interrupted` and a terminal reason. Child commands run in a process group and are terminated on timeout/abort; Docker Compose operations and `docker ps` inspection have bounded timeouts, with Compose teardown capped at 30 seconds. Services are cleaned through `finally` paths.

Deterministic suite result: 56/56 passed with NVM npm, including storage preflight/monitor checks, normal and interrupted solver runs, process timeout/normal exit, and service cleanup on success/error/interruption/startup failure. No system npm changes.

Pure Poetry was run once through `solve` as a NYU CTF Bench development case: Luna Medium, `ctf-solve + ctf-forensics`, two rounds, no retries, network disabled, 240-second wall limit. It ended `unsolved` after 174.195 seconds, with no candidate and no verified flag. Usage: 1,284,592 input (1,163,008 cached), 19,052 output (11,811 reasoning); monetary cost unknown. Trace diagnoses a legacy Rez `VECTOR:ICON`/`ncif` decoding knowledge/tooling gap, not an environment failure. Full safe records are in the experiment report and ledger.

**Verifier-custody limitation:** private answer JSON and verifier digest were absent from the solver workspace and saved logs, and no trace shows the solver reading the private JSON. However, telemetry proves the SDK shell could read a user memory file outside its workspace; file mode 0600 and path separation therefore do not prove an OS-level deny. Treat this as an integrity-limited development attempt and exclude it from strict verifier-isolated solve-rate evidence. Do not claim technical inaccessibility. Future model runs require separate-UID/container/mount isolation with a demonstrated deny test.

Next: implement and test OS-level verifier isolation, then develop a reusable Rez/ncif inspection method on a separate, properly isolated development fixture. Do not rerun Pure Poetry as tuning or touch NYU test-split cases.


## 2026-10-29 verified continuation addendum

- **Verifier isolation:** Codex Linux permission profile with explicit denies for controller verifier storage, archived challenge source metadata, and Codex auth file is applied to each solver thread. A zero-model-token subprocess probe uses the same UID (1000) and actual SDK sandbox/filesystem view. Direct, symlink, `/proc/self/root`, `/proc/<controller>/root`, and hardlink access were denied; controller reads remained available; protected probe files had link count 1. Palo Alto preflight recorded five protected files and passed. This demonstrates the configured boundary on this host, not a separate UID/container boundary or a universal OS claim.
- **NYU Palo Alto development attempt:** source commit `b899e00ae75e9c55a2521ec890125298ca6a4b0e`, reverse category, GPL-2.0, artifact SHA-256 `ca2e61a92fd4286941a679e63ac17725af3baad7a214fe193429be59d8b91fe3`. Luna Medium, `$ctf-solve + $ctf-reverse`, one attempt, two rounds, 0 retries, 240-second timeout. Runner durably recorded `environment_interrupted / wall_timeout` after 239.823s. No flag candidate, no verification, no TTF. Completed-round usage: 928,953 input (854,272 cached), 4,537 output (1,349 reasoning); round two usage was not reported before abort. Not a solver failure and excluded from SR. Safe evidence: `docs/reports/experiments/EXP-2026-10-29-NYU-PALO-ALTO/`.
- **HVIF investigation:** `ncif` signature validated as HVIF with an MIT cross-platform converter built and exercised on benign generated samples and the Pure Poetry VECTOR:ICON resource. Generic Rez extraction yielded 5,471 bytes; SVG/PNG conversions worked; malformed/truncated inputs rejected. It rendered abstract vector artwork, not a recovered answer. Canonical Skills V2 forensics upgrade is added and helper validation passes; see the Skills V2 branch.
- No change to default model or solver topology. The repository's earlier benchmark summaries remain historical single-pass/sample evidence, not a guarantee for novel tasks.


## 2026-10-29 follow-on tooling and active experiment

- Canonical Skills V2 reverse readiness helper inspects ELF header/program headers/dynamic loader, checksec, matching QEMU, debugger/disassembler and Java/Ghidra headless availability without executing the target. A bounded optional Ghidra help probe detects usage output without project creation/import. On a benign ELF32 i386 fixture, the prior manual triage took 336.4 ms and the bundled report took 344.47 ms; richer report, effectively same startup time, with no speedup claim. Direct and qemu-i386 execution of the benign syscall-only fixture both exited 0. Do not infer compatibility for arbitrary files under host seccomp.
- A separate synthetic Rez `VECTOR:ICON` containing an independently generated HVIF sample extracted byte-for-byte, then converted to valid SVG and 128x128 PNG. This is format validation, not a CTF solve.
- The preregistered NYU development Crypto attempt `Bricks of Gold` was stopped after a cache-scope isolation gap was found; it is not a solver failure and is excluded from SR. See the integrity correction in the ledger.


## 2026-10-29 verifier-cache correction and fresh Misc result

- **Verifier isolation scope expanded:** The original Codex sandbox proof did not cover public answer-bearing benchmark clones under `/var/tmp/ctf-racer-research-cache`. A direct/symlink zero-token probe read the Bricks of Gold README and source JSON, so that run was stopped and excluded from SR. The NYU research cache was moved beneath `runs/_research-cache`; the old `/var/tmp` path is now a symlink. The runner automatically denies the protected cache root, and challenge metadata can declare additional private roots and probe files. Actual sandbox probes of eight source/verifier files denied direct, symlink and hardlink reads while controller reads remained available. This remains same-UID, host-specific Codex policy isolation.
- **Fresh development challenge:** NYU CTF Bench Networking 1 (Misc), artifact SHA-256 `7072e7e1a42efe6b77bc0a428b5297440f123098143e830c1e9b7c7ae6886165`, source archive commit `4c5744f55a31a58e03d6118c9dbb1c18e5bbdfa9`, development snapshot commit `b899e00ae75e9c55a2521ec890125298ca6a4b0e`. One Luna Medium primary attempt, `ctf-solve + ctf-misc`, one round, no retries, network disabled, 600s cap. It solved and passed independent SHA-256 verification in 36.718s; first useful artifact test was ~15s. Usage: 186,311 input (155,392 cached), 1,988 output, 558 reasoning tokens. See `docs/reports/experiments/EXP-2026-10-29-NYU-NETWORKING-1/`.
- This is one small development result, not an SR estimate or hard-challenge generalization claim. No methodology/skill change was justified; retain as regression material.
- CTF Racer deterministic suite is **61/61 passed** using NVM npm after the cache-boundary change. Skills V2 reverse readiness and HVIF work remain committed on their separate branch; see the latest report.
- **Next measurable task:** Run one separate, untouched NYU development Crypto case with a more substantial artifact/hypothesis cycle, pre-registering it after checking integrity and verifier custody; use four rounds/600–900s only when the artifact justifies that bound. Do not reuse Bricks of Gold as a fresh evaluation.

## 2026-10-29 fresh multi-step Crypto development result

NYU CTF Bench `2013f-cry-stfu` (CSAW Finals 2013, Crypto; GPL-2.0) was selected from the pinned development snapshot, with original player artifact hashes and Git object IDs recorded in the preregistration and result ledger. The challenge was untouched in local research records at selection. The controller kept challenge source/answer material under the protected research cache; the solver received only `stfu` and `flag.stfu`. The actual Codex sandbox probe denied direct, symlink, `/proc` root, and hardlink access to the protected source/verifier paths for 16 probe files, with controller reads preserved. Storage preflight and monitoring passed.

One normal CTF Racer attempt ran with Luna Medium, one persistent solver, `ctf-solve + ctf-crypto`, one attempt, no retries/escalation, network off, 4-round maximum and 900-second cap. It ended normally `unsolved` after 4 rounds / 418.129 seconds, before the wall cap. The independent verifier accepted no candidate; one candidate was rejected; TTF is null. This is valid unsolved-within-budget development evidence. Four completed turns reported 8,330,514 input (7,955,840 cached), 73,505 output, and 48,156 reasoning tokens; cost was not measured.

Trajectory diagnosis: static inspection and tests identified the artifact structure and LFSR transform. The solver wrote a decryptor and obtained plaintext that re-encrypted byte-for-byte to the original 25,316-byte artifact. It interpreted the output as an ASCII-art banner, but its exact answer-format inference was unsupported and rejected. Later rounds verified the plaintext and audited whitespace; the accepted exact candidate remained unknown. This demonstrates strong cryptographic artifact recovery but not a solve. No controller or Skills V2 changes are justified by one failure. Full safe summary: `docs/reports/experiments/EXP-2026-10-29-NYU-STFU/summary.json`; raw private state remains ignored in `runs/nyu-dev-2013-stfu/`.

Next: validate a generic banner/text interpretation and exact-answer derivation checklist against independent benign or development examples. Do not reuse STFU as a fresh evaluation or encode its phrase/answer in skills. Then select a distinct untouched development task in another category.

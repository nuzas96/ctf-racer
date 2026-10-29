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

# Research queue

Use the cycle: research -> hypothesis -> pre-registered design -> baseline -> change -> real archived challenge -> independent verification -> failure analysis -> checkpoint. Cite primary evidence separately from assumptions. A held-out challenge that informs any change becomes development material.

## RQ-001 — Wall-time and storage controls

- **Question:** Can the runner enforce bounded wall time and solver/tool usage while preserving its persistent-thread policy and cleaning up local services/workspaces?
- **Hypothesis:** An explicit per-run budget plus cancellation/cleanup produces a safely bounded experiment without changing solver prompts or default policy.
- **Evidence:** `src/agent.js` consumes Codex SDK streamed events; SDK `runStreamed` accepts `AbortSignal`. Local service lifecycle cleanup exists in `src/service.js`.
- **Design:** Development fixtures first; test timeout during a turn and service cleanup; record token usage where events provide it. Do not use a held-out challenge for implementation debugging.
- **Progress:** Per-run lower round cap; actual `/tmp` and workspace `statfs` preflight; 2-second storage monitoring; per-run wall timer; SDK abort signal; `environment_interrupted` terminal state; child process-group TERM/KILL; bounded Docker Compose cleanup. Full suite 56/56.
- **Acceptance:** Deterministic tests cover normal solve/process completion, timeout, interruption, hung child termination, and service cleanup on success/error/interruption/startup failure. No token/cost hard cap exists.
- **Status:** Core wall/storage guards implemented. Token/cost budgets and real hung-Docker-daemon cleanup evidence remain open.

## RQ-002 — Evaluation registry and held-out hygiene

- **Question:** Can benchmark role, selection date, artifact hashes, verifier custody, exposure, and contamination be tracked without relying on conversational memory?
- **Hypothesis:** A small registry with immutable experiment entries makes benchmark role changes auditable.
- **Design:** Start with documented schema and append-only ledger; implement registry only when selecting a genuinely unused challenge.
- **Status:** Open.

## RQ-003 — Efficient skill retrieval and routing proof

- **Question:** Do focused references opened under one primary category improve TTF or verified rate compared with broader retrieval?
- **Design:** Repeated, matched development cases; record opened references, tokens if available, rounds, verified outcome and TTF. Do not alter the frozen routing policy on one run.
- **Status:** Open.

## Research sources reviewed

- Primary project evidence: CTF Racer `PROJECT_STATE.md`, suite reports, implementation and tests.
- Canonical knowledge architecture: Skills V2 `README.md`, `CATALOG.md`, and `ctf-skill-upgrade/SKILL.md`.
- [Veria Labs CTF Agent](https://github.com/verialabs/ctf-agent), MIT: coordinator plus parallel model swarms, isolated Docker tools, CTFd polling, cross-solver messaging, tracing, cost tracking, repeated-tool loop detection, and per-command timeouts. The README claims 52/52 and first place at BSidesSF 2026; this is project-authored competition evidence and is not independently validated here. The current architecture is faster in its stated latency objective but incurs parallel model usage and coordinator complexity. Reusable candidates: enforceable per-command timeout, explicit cost ceiling, loop detector. Do not adopt same-challenge swarms absent controlled CTF Racer evidence.
- [NYU CTF agents](https://github.com/NYU-LLM-CTF/nyuctf_agents), MIT: baseline single executor and D-CIPHER planner/executor/optional auto-prompter variants, Docker challenge environment, configured round and cost limits, stored trajectories. This offers a useful ablation precedent, but adds planner/context and model-call overhead; no direct result comparison with CTF Racer was conducted.
- [NYU CTF Bench](https://github.com/NYU-LLM-CTF/NYU_CTF_Bench), GPL-2.0: current main HEAD at research time is `4c5744f55a31a58e03d6118c9dbb1c18e5bbdfa9` (2025-09-22). Public `test_dataset.json` (last changed `c9afbe895276c2e8e17739344278abe6d22a1632`) and `development_dataset.json` (last changed `b899e00ae75e9c55a2521ec890125298ca6a4b0e`) were fetched without challenge artifacts or answer fields. Retrieved snapshots contain 200 test entries (`crypto 52, rev 51, pwn 39, web 19, misc 24, forensics 15`) and **57** development entries (`crypto 11, pwn 10, rev 10, web 10, forensics 10, misc 6`); README says 55, a confirmed metadata/documentation mismatch at the pinned snapshot.
- [Cybench paper](https://arxiv.org/abs/2408.08926) / [dataset implementation](https://github.com/andyzorigin/cybench): 40 professional CTF tasks across six domains, with subtasks and multiple agent scaffolds. [Inspect Evals Cybench adapter](https://ukgovernmentbeis.github.io/inspect_evals/evals/cybench/index.html) states 39 tasks are exposed there because one GPL-licensed task is omitted. Good for cross-benchmark replication; avoid importing restricted challenge materials without checking their per-artifact licenses.
- [CTF-Dojo paper](https://arxiv.org/abs/2508.18370): reports execution-verified trajectories used for training and gains on several benchmarks. Relevant hypothesis: evidence-quality trajectories may improve reusable methods; not an immediate controller change and results do not show that adding retrieved writeups to a live solver improves TTF.

## RQ-004 — Safe bounded regression execution (completed)

- **Question:** Can a known archived case be run now with a practical hard stop while formal in-run budget controls are developed?
- **Plan:** Public archived CSAW Forensics regression fixture, 1 primary attempt, 0 fresh retries, Luna Medium, max 2 continuation rounds, 900-second external wall cap. No challenge network or service. This caps wall time and rounds, but not tokens; report actual telemetry if present. Do not use this repeated case to tune held-out performance.
- **Integrity:** local PCAP SHA-256 and Git blob SHA-1 recorded; official source repository could not currently be resolved by `git ls-remote`, so source commit is unknown. The fixture is already included in the prior project benchmark definition and is explicitly regression material.
- **Outcome:** Initial result stopped unsolved at 365s during round 2 after `/tmp` tmpfs reached 100%; one completed turn reported 766,097 input (712,064 cached), 6,115 output. Ledger correction `EXP-2026-10-29-GHOST-CLASSIFICATION-CORRECTION` reclassifies it as environment-interrupted, not an ordinary solver failure. No retry.
- **Status:** Complete as environment-interrupted evidence; exclude from solve-rate denominator. Resource guards are now implemented; no skill tuning from this run.

## Dataset preparation snapshot

- NYU README documents 200 test and 55 development cases. Dataset JSON last-change commits are pinned above; the retrieved files contain 200 test and **57** development records, so the README mismatch is verified rather than pending pinning.
- Snapshot hashes: test JSON `aefc52210cb7f15509d82f3ee4b163df6fc331ee446a0977bca1db5fd99fa0a4`; development JSON `8d81040300001bfe8fa7d4cc0be0301d21107331125053ccff3120e22d407533`. The JSON files were moved with their research cache to `/var/tmp/ctf-racer-research-cache/` after the `/tmp` exhaustion. NYU CTF Bench is GPL-2.0; do not copy source materials without honoring its license.
- Pure Poetry development fixture: source commit `b899e00ae75e9c55a2521ec890125298ca6a4b0e`, GPL-2.0, artifact SHA-256 `cc4d3bfaccae770a04d8a069d00fbf4aa9acc0c995ca5716a77743df046a86fc`. One Luna Medium attempt, 2 rounds, 174.195s, unsolved/no candidate; usage 1,284,592 input (1,163,008 cached), 19,052 output. It exposed a legacy Rez `VECTOR:ICON`/`ncif` tool/knowledge gap. The answer/digest were absent from the workspace and logs, but host-level read isolation was not proven; exclude from strict verifier-isolated solve-rate metrics.
- Cybench is a second 40-task source over six domains; the Inspect Evals adaptation includes 39 tasks and excludes one GPL-licensed task. Challenge-level licenses still need review before reuse.

## RQ-005 — Prove solver cannot read verifier material (completed on this host)

- **Question:** Can CTF Racer demonstrate that model/tool processes cannot read host-held answers or verifier secrets?
- **Evidence:** Pure Poetry telemetry shows the SDK shell read a user memory file outside its workspace. The answer file was outside the workspace and absent from saved logs, but mode 0600/path separation did not prove an OS-level deny.
- **Hypothesis:** A separate UID or container/mount namespace with a read-denied verifier mount provides a testable custody boundary.
- **Design:** Use a deterministic canary and assert solver-side reads fail while controller-side verification succeeds; no model usage required.
- **Status:** Demonstrated on this host with actual Codex Linux sandbox subprocess and five controller-held probe files; see Palo Alto preflight record and `src/verifier-isolation.js`. Same UID is retained, so this is not container/UID isolation. Re-run the zero-token probe after SDK or policy changes.

## RQ-006 — Reusable classic Mac vector-icon forensics (tool path validated; skill upgrade implemented)

- **Question:** What deterministic toolchain or recognition steps efficiently decode Rez `VECTOR:ICON` / `ncif` payloads?
- **Evidence:** Pure Poetry yielded a 5,471-byte `ncif` payload and structured-record probes, but no key. Existing focused references cover image steganography and HFS resource forks, not this vector-icon encoding.
- **Hypothesis:** A reusable format-recognition and conversion path can reduce first useful experiment time for this artifact class.
- **Design:** Research format specifications and maintained parsers, then validate on at least two unrelated development fixtures or known-good public samples. Keep challenge-specific extraction out of the canonical skill.
- **Status:** Tool path and generic extractor validated with benign generated HVIF and the separate archived Pure Poetry development artifact; canonical `ctf-forensics` upgrade implemented and validation-passing on its feature branch. Keep performance impact unclaimed; future unrelated `.rdef`/HVIF case needed for generalization.


## RQ-007 — Improve bounded reverse-analysis startup and progress

- **Question:** Can environment-aware ELF32 triage and bounded headless-analysis setup improve verified TTF for static reverse tasks?
- **Evidence:** Palo Alto required `qemu-i386` because direct execution hit the host's 32-bit syscall limitation. Ghidra setup/analysis consumed a substantial fraction of a 240-second two-round run; it ended on the hard wall with two validators unresolved.
- **Hypothesis:** A deterministic preflight detecting ELF32 execution constraints and readying available emulation/disassembly tools can reduce wasted early probes.
- **Next design:** Use a separate development ELF32 fixture; zero-token measure tool availability/startup, and optionally a matched single-run Luna baseline only after reproducible prep. Do not tune Palo Alto itself or treat its interruption as solver miss.
- **Status:** Highest priority engineering follow-up; no implementation accepted yet.

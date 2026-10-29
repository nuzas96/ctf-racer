# Research queue

Use the cycle: research -> hypothesis -> pre-registered design -> baseline -> change -> real archived challenge -> independent verification -> failure analysis -> checkpoint. Cite primary evidence separately from assumptions. A held-out challenge that informs any change becomes development material.

## RQ-001 — Enforceable experiment budgets (highest priority)

- **Question:** Can the runner enforce bounded wall time and solver/tool usage while preserving its persistent-thread policy and cleaning up local services/workspaces?
- **Hypothesis:** An explicit per-run budget plus cancellation/cleanup produces a safely bounded experiment without changing solver prompts or default policy.
- **Evidence:** `src/agent.js` consumes Codex SDK streamed events but has no timeout/token-budget controls; `src/runner.js` limits continuation rounds only. Local service lifecycle cleanup exists in `src/service.js`.
- **Design:** Development fixtures first; test timeout during a turn and service cleanup; record token usage where events provide it. Do not use a held-out challenge for implementation debugging.
- **Progress:** `solve ... --max-rounds N` now lowers (never raises) the configured continuation limit. Test coverage added. External process-group stop was exercised during the Ghost run. Token budgets and runner-integrated wall-time/service cleanup are still open.
- **Acceptance:** Deterministic tests prove per-run round limits and that bounded runner timeouts mark state terminal and clean up child/service processes. Do not interpret the external wrapper as token-cost enforcement.
- **Status:** In progress. A practical timed regression attempt has been made; future experiments can proceed with measured external wall bounds while model usage is reported and actively monitored.

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

## RQ-004 — Safe bounded regression execution (active)

- **Question:** Can a known archived case be run now with a practical hard stop while formal in-run budget controls are developed?
- **Plan:** Public archived CSAW Forensics regression fixture, 1 primary attempt, 0 fresh retries, Luna Medium, max 2 continuation rounds, 900-second external wall cap. No challenge network or service. This caps wall time and rounds, but not tokens; report actual telemetry if present. Do not use this repeated case to tune held-out performance.
- **Integrity:** local PCAP SHA-256 and Git blob SHA-1 recorded; official source repository could not currently be resolved by `git ls-remote`, so source commit is unknown. The fixture is already included in the prior project benchmark definition and is explicitly regression material.
- **Outcome:** Stopped unsolved at 365s during round 2 after `/tmp` tmpfs reached 100%; 1 complete model turn reported 766,097 input tokens (712,064 cached), 6,115 output (2,495 reasoning), no candidate. TShark rejected the original PCAP; manual parsing found one corrupted magic byte; repaired copy parsed 504 UDP packets with TTL distribution 119/385. Environment exhaustion was caused by two full NYU benchmark clone attempts (~5.1 GB) in `/tmp`; this is not a challenge-solving failure. No retry this session.
- **Status:** Complete as a stopped regression record; see experiment ledger. Reconsider only after disk-space guard and a deliberate usage budget; no skill tuning from this run.

## Dataset preparation snapshot

- NYU README documents 200 test and 55 development cases. Dataset JSON last-change commits are pinned above; the retrieved files contain 200 test and **57** development records, so the README mismatch is verified rather than pending pinning.
- Snapshot hashes: test JSON `aefc52210cb7f15509d82f3ee4b163df6fc331ee446a0977bca1db5fd99fa0a4`; development JSON `8d81040300001bfe8fa7d4cc0be0301d21107331125053ccff3120e22d407533`. The JSON files were moved with their research cache to `/var/tmp/ctf-racer-research-cache/` after the `/tmp` exhaustion. NYU CTF Bench is GPL-2.0; do not copy source materials without honoring its license.
- Prepared static Forensics development fixture: `local-challenges/nyu-dev-2016-pure-poetry` (Git-ignored to avoid silently redistributing GPL data). Source commit `b899e00ae75e9c55a2521ec890125298ca6a4b0e`, path `development/2016/CSAW-Finals/forensics/pure_poetry`, license GPL-2.0. Player artifact: 11,844 bytes, SHA-256 `cc4d3bfaccae770a04d8a069d00fbf4aa9acc0c995ca5716a77743df046a86fc`, Git blob SHA-1 `6792d3af2c09b9d432b5a29cedddedb96416a446`. Loader/artifact integrity and zero-token preflight passed with 0 findings. Its source JSON contains a raw answer, kept outside the solver fixture at `/var/tmp/ctf-racer-research-cache/candidates/2016-pure-poetry/source-challenge.json` (mode 600); the fixture contains only a SHA-256 verifier. Workspace construction confirmed the digest is not copied. No reference solution is present in the solver workspace. Route: `ctf-solve + ctf-forensics`.
- Cybench is a second 40-task source over six domains; the Inspect Evals adaptation includes 39 tasks and excludes one GPL-licensed task. Challenge-level licenses still need review before reuse.

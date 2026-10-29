# CTF Racer research report — 2026-10-29

## Architecture and checkpoint

Resumed branch `research/bootstrap-continuity-2026-10-28` at commit `72ab44b`. Current architecture remains Luna Medium, one persistent primary solver per isolated challenge, `$ctf-solve` plus one category skill, external challenge network disabled by default, and controller-side flag verification. Existing architecture and canonical Skills V2 methodology were preserved.

New controller option: `solve <challenge-dir> --max-rounds N`. It can lower but never raise the configured maximum; the global four-round default is unchanged.

## External systems and research

- [Veria Labs CTF Agent](https://github.com/verialabs/ctf-agent), MIT: local revision `3366d56`. Its coordinator, parallel model swarms, Docker sandboxes, command timeouts, cost accounting, loop detection and traces were inspected. Its README claims 52/52 at BSidesSF 2026; that result is self-reported, not independently verified here. Reusable experiments: per-command timeout, cost cap, loop detection. No multi-model swarm adopted.
- [NYU CTF agents](https://github.com/NYU-LLM-CTF/nyuctf_agents), MIT: local revision `612190f`. Inspected single executor and D-CIPHER planner/executor/optional auto-prompter, configured round/cost limits, Docker execution and transcript logs. Useful ablation design; additional planning agents add calls/context and remain unjustified for CTF Racer.
- [NYU CTF Bench](https://github.com/NYU-LLM-CTF/NYU_CTF_Bench), GPL-2.0: README describes a 200-case test set and 55-case development set across six categories. Pinned metadata snapshots contain 200 test and **57** development entries, confirming a README mismatch. Test category counts: crypto 52, reverse 51, pwn 39, misc 24, web 19, forensics 15. Development: crypto 11, pwn 10, reverse 10, web 10, forensics 10, misc 6. Dataset file commits and hashes are in `docs/RESEARCH_QUEUE.md`.
- [Cybench paper](https://arxiv.org/abs/2408.08926) and [Inspect Evals adapter](https://ukgovernmentbeis.github.io/inspect_evals/evals/cybench/index.html): 40-task benchmark across six domains; adapter exposes 39 and omits one GPL task. Relevant as a future cross-benchmark source; check per-challenge licenses before preparation.
- [CTF-Dojo](https://arxiv.org/abs/2508.18370): paper reports execution-verified trajectories and benchmark gains. It motivates research into trajectory quality, not a controller change without direct evidence.

### Architecture comparison

| Area | CTF Racer | Veria Labs CTF Agent | NYU agents / benchmark | Cybench |
|---|---|---|---|---|
| Orchestration | One persistent primary solver per challenge; concurrency only across distinct challenges | Coordinator plus concurrent model swarms per challenge and CTFd poller | Baseline single executor; D-CIPHER planner/executor/optional auto-prompter | Evaluation harness with multiple tested tool/agent scaffolds |
| Context and retrieval | Persistent thread; `ctf-solve` + one category and evidence-selected focused Skills V2 references | Coordinator shares findings and traces across solver models; no comparable canonical skill retrieval was found in inspected sources | Prompt/toolset variants; multi-agent configuration supports a bounded observation window; no Skills V2-like external knowledge layer observed | Subtasks and structured tool observations help decompose hard tasks |
| Execution environment | Isolated workspace; Docker lifecycle for configured local services; challenge network disabled by default | Docker sandbox with bounded memory/CPU and command timeouts | Dockerized challenge environment and isolated test network | Dockerized challenge task environments |
| Recovery and controls | Stall detection, same-thread continuation, optional sequential fresh retry across explicit race policy; round cap and streamed token telemetry | Repeated-tool loop detector, per-command timeout, coordinator guidance, first solver to succeed wins | Configured round and dollar-cost limits; handles cancellation, rate limits, and context-length errors | Subtasks provide partial progress evaluation; not a CTF Racer runtime controller |
| Verification | Controller-side independent SHA-256, candidate accepted only after match | Competition README reports challenge wins; no independent hashed verifier design established from inspected implementation | Framework loads challenge answer metadata for harness checks; not equivalent evidence to CTF Racer's secret-separated controller verifier | Benchmark evaluator/subtasks score agent results |
| Usage and results | Historical 5/5 one-pass, 14/15 robustness sample, 5/5 cross-challenge race; current repeat stopped by host storage failure | README self-reports 52/52 and first place at BSidesSF 2026; no matched TTF/cost comparison | Public benchmark has six categories and pinned dev/test metadata; no matched CTF Racer result run this session | Paper reports 40-task dataset and scaffold comparisons; adapter excludes one GPL task |

**Adoption decision:** No same-challenge swarms or planner layer. The competitors support further measurement of command timeouts, cost visibility, and loop recovery. CTF Racer's per-run lower round cap is the only controller change from this review; storage preflight and reliable cancellation/cleanup are the next implementation work. Skills V2 was not modified. The large NYU clones were preserved under `/var/tmp`; their mistaken placement in `/tmp` caused the run failure described below.

## Archived CTF experiment

**Ghost in the Machine (CSAW 2026, Forensics), regression repeat.** One Luna Medium primary attempt; `ctf-solve` + `ctf-forensics`; opened focused `references/network-pcap.md`; max two continuation rounds; zero retries; network disabled; external 900-second wall limit. Local artifact SHA-256 `69cba9a6e4057136a72f8de3d6959e04219312b6741fd8db973c1a8b0e210508`; Git blob SHA-1 matches manifest `73f6bab07cd75e7ca132ba238d1c4e8119f15489`. The advertised upstream source repo currently returns “Repository not found,” so commit cannot be confirmed.

**Outcome: stopped unsolved after 365 seconds; no candidate and no verified flag.** The completed model turn reported 766,097 input tokens (712,064 cached), 6,115 output (2,495 reasoning). Usage cost was not available. Trace: `tshark` rejected the original PCAP; the solver repaired a copy’s single corrupted magic byte, parsed 504 UDP records, and observed TTL populations 119 at 113 and 385 at 64. During round two, workspace shell/file operations failed because `/tmp` tmpfs reached 100%. Two full benchmark clone attempts created about 5.1 GB under `/tmp`; this research setup caused the failure. The process group was stopped before more usage accrued. No CTF-solving defect is established; do not use this run to tune skills or controller logic.

Redacted reproducibility artifacts (progress, skill proof, run log, terminal state and live telemetry) are committed under `docs/reports/experiments/EXP-2026-10-29-GHOST-REGRESSION/`; their SHA-256 digests are indexed in the ledger. Checks found no raw flag pattern, verifier digest, home path, or reasoning-content dump.

## Dependency diagnosis and validation

System `/usr/bin/npm` fails before project dependency inspection: `/usr/share/nodejs/hosted-git-info/lib/index.js:8` expects `LRU` to be constructible, while system `lru-cache` 11.2.7 exports an object containing `LRUCache`; `hosted-git-info` is 6.1.1. The installed NVM npm 11.17.0 works: `npm ls --depth=0` reports `@openai/codex-sdk@0.159.0`, and its `npm test` passes. No dependency/global package upgrade was made.

**49/49 tests passed** with `/home/nuzhmi/.nvm/versions/node/v24.19.0/bin/npm test`. This includes two new round-cap tests. The original four-round policy was restored after the experiment. Research clones were moved to `/var/tmp/ctf-racer-research-cache/` with root directories mode 700; the private source challenge JSON is mode 600. `/tmp` now has 5 GB free.

## Accepted, deferred and next

- **Accepted:** per-run continuation-round override that only lowers the current configured limit.
- **Deferred:** multi-agent solving; model escalation; monetary cost limits until Codex plan pricing/accounting is established; skill changes based on the stopped regression.
- **Prepared next fixture:** GPL-2.0 NYU development challenge `local-challenges/nyu-dev-2016-pure-poetry` is pinned, integrity-checked, and zero-token preflighted; its raw answer is kept outside the solver workspace with mode 600. Full details and hashes are in `docs/RESEARCH_QUEUE.md`.
- **Current limitations:** upstream CSAW repository is unresolved; CTF Racer has no integrated wall-time/cancellation terminal-state handling or disk-capacity preflight. Model token usage has no hard cap in this SDK path; usage cost is unknown.
- **Highest-priority next task:** add zero-token disk-capacity preflight plus timeout cancellation that records terminal state, and test child/service cleanup. Then run the prepared NYU *development* challenge once with a practical explicit wall bound and one solver; do not touch the NYU test split for tuning.

See `docs/EXPERIMENT_LEDGER.jsonl` for immutable run records and corrections, and `docs/HANDOFF.md` for the exact continuation checkpoint.

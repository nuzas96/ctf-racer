# CTF Racer research checkpoint — 2026-10-28

## State

Continuity architecture documents and append-only experiment ledger initialized on `research/bootstrap-continuity-2026-10-28`. Existing solver architecture is preserved. This is a development checkpoint, not completion of the long-term research program.

## Verified existing evidence

- Baseline: `gpt-6-luna`, medium; one persistent solver per challenge; isolated workspaces; `$ctf-solve` plus one primary category skill; deterministic preflight; independent controller verification.
- Historical broad results recorded in `PROJECT_STATE.md`: one clean five-category pass 5/5, three-run-per-challenge robustness sample 14/15, and five-category race 5/5 with 335.15s wall elapsed. These do not guarantee novel challenge performance.
- Current implementation includes live telemetry, intake validation, cross-challenge scheduler, and persistent watch queue. Latest test count in project state: 47/47; earlier user-supplied 48/48 is not corroborated by current checkpoint.
- Current source commits at audit: CTF Racer `012399f`; Skills V2 `7a4bcda`.

## Research and experiment

Reviewed project state, architecture, five-category suite definition, implementation references, Skills V2 README/CATALOG, and its skill-upgrade methodology. Highest-impact question is dependable per-run budget enforcement. The planned regression candidate is archived CSAW 2026 Forensics “Ghost in the Machine”; source path is recorded in its challenge manifest.

The required real challenge gate is **BLOCKED before execution**. The archived CSAW forensic challenge is defined in the suite, but its PCAP is absent locally. The runner has a global four-round default and no demonstrated per-run override. The SDK integration exposes streamed events but no established reliable wall-clock/token budget. These fail the explicit artifact and resource-safety gates, so no solver/model call was made. `npm ls --depth=0` also failed with `LRU is not a constructor`; dependency health needs diagnosis. See the structured ledger entry for details.

## Changed files

- `docs/ROADMAP.md`, `docs/RESEARCH_QUEUE.md`, `docs/DECISIONS.md`
- `docs/EXPERIMENT_LEDGER.jsonl`, `docs/HANDOFF.md`, `docs/reports/LATEST.md`

## Validation, limitations, next action

Validation: all 47 existing Node tests pass; `git diff --check` is clean; the ledger parses as one unique JSON record; and `node scripts/research-status.js` reads the snapshot and ledger without model calls. `npm ls --depth=0` remains an environment/dependency inspection failure (`LRU is not a constructor`). No solver source or Skills V2 content was changed. No model costs or token metrics are available.

**Next:** diagnose dependency inspection failure; implement/test enforceable per-run round and wall/resource budgets with cancellation and service cleanup; prepare and hash the archived PCAP and record its source commit; rerun zero-token preflight; then execute one pre-registered Luna Medium archived challenge experiment and independently verify the candidate.

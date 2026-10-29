# Research record ownership

| Information | Authoritative file |
|---|---|
| Permanent instructions and startup order | `../AGENTS.md` |
| Stable execution rules | `../ARCHITECTURE.md` |
| Current verified snapshot | `../PROJECT_STATE.md` |
| Milestones and dependencies | `ROADMAP.md` |
| Open hypotheses and research leads | `RESEARCH_QUEUE.md` |
| Immutable experiment records | `EXPERIMENT_LEDGER.jsonl` |
| Evidence-backed engineering choices | `DECISIONS.md` |
| Exact continuation point | `HANDOFF.md` |
| Human-readable latest summary | `reports/LATEST.md` |

Reports summarize records; they do not supersede them. Append one JSON object per line to the ledger. Never amend or delete an existing experiment; issue a new entry correcting or superseding it and link the prior ID. Keep secrets, raw flags, verifier hashes, and private model reasoning out of solver-visible records.

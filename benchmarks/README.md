# Archived CTF Benchmarks

These benchmarks are real archived CTF challenges used to measure the CTF Racer architecture.

Rules for a fair run:
- Do not commit raw answer keys or known flags into this repository; controller-side SHA-256 ground truth is allowed for independent verification.
- Each `solve` invocation starts with a fresh workspace.
- External web research and challenge network access remain disabled unless the benchmark explicitly requires them and the competition rules allowed them.
- Measure at least status, rounds, and elapsed wall-clock time.

Run a benchmark with:

```bash
npm run racer -- solve benchmarks/<challenge-id>
```

Current benchmark set:

- `meridian-vault-2` — NADI CTF crypto challenge, offline, AES-CTR relay-message artifact.
- `muse-in-disguise` — NADI CTF forensics/audio-steganography challenge; original binary artifact is imported locally by exact size/SHA-256.

Cross-category architecture suite: `benchmarks/suite.json`.

```bash
npm run racer -- suite-check benchmarks/suite.json
npm run racer -- suite benchmarks/suite.json
```

Suite runs default to one attempt per challenge. Increase repetitions only with an explicit `--runs N`.

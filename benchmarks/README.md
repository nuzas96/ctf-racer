# Archived CTF Benchmarks

These benchmarks are real archived CTF challenges used to measure the CTF Racer architecture.

Rules for a fair run:
- Do not commit answer keys or known flags into this repository.
- Each `solve` invocation starts with a fresh workspace.
- External web research and challenge network access remain disabled unless the benchmark explicitly requires them and the competition rules allowed them.
- Measure at least status, rounds, and elapsed wall-clock time.

Run a benchmark with:

```bash
npm run racer -- solve benchmarks/<challenge-id>
```

Current benchmark set:

- `meridian-vault-2` — NADI CTF crypto challenge, offline, AES-CTR relay-message artifact.

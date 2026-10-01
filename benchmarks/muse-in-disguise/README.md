# Muse in Disguise

Archived NADI CTF forensics/steganography benchmark.

The original artifact is intentionally not embedded as text in the repository. Import the exact local artifact before running the benchmark:

```bash
npm run racer -- benchmark-import benchmarks/muse-in-disguise --source /path/to/Muse.jar
```

The importer verifies the artifact size and SHA-256 declared in `challenge.json` before copying it into `files/`.

The raw flag is not stored in this repository. Controller-side `flag_sha256` is used only for independent benchmark verification.

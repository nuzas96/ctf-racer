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

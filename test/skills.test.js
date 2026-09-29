import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { retrieveSkills } from "../src/skills.js";

test("retrieves selective crypto skill sections for nonce reuse", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-skills-"));
  const projectRoot = path.join(root, "ctf-racer");
  const skillRoot = path.join(root, "codex-skills");
  const workspace = path.join(root, "workspace");
  fs.mkdirSync(path.join(skillRoot, "ctf-crypto"), { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });

  fs.writeFileSync(path.join(skillRoot, "ctf-crypto", "SKILL.md"), [
    "# router",
    "## First pass",
    "FIRST",
    "## Technique router",
    "ROUTER",
    "## Core classification questions",
    "QUESTIONS",
    "## Block cipher / MAC discipline",
    "BLOCK",
    "## RSA decision tree",
    "SHOULD_NOT_LOAD"
  ].join("\n"));

  fs.writeFileSync(path.join(skillRoot, "ctf-crypto", "modern-ciphers.md"), [
    "# modern",
    "## AES-GCM Nonce Reuse / Forbidden Attack",
    "CTR reuse means C1 XOR C2 = P1 XOR P2.",
    "## Other attack",
    "UNRELATED"
  ].join("\n"));

  fs.writeFileSync(path.join(skillRoot, "ctf-crypto", "classic-ciphers.md"), [
    "# classic",
    "## OTP Key Reuse / Many-Time Pad XOR (BYPASS CTF 2025)",
    "Use crib dragging.",
    "## Caesar",
    "UNRELATED"
  ].join("\n"));

  const result = retrieveSkills({
    projectRoot,
    workspace,
    challenge: { category: "crypto" },
    preflight: { findings: [{ type: "reused-nonce" }] },
    policy: {},
  });

  assert.equal(result.foundLibrary, true);
  assert.equal(result.sections, 6);

  const report = fs.readFileSync(path.join(workspace, "SKILLS.md"), "utf8");
  assert.match(report, /FIRST/);
  assert.match(report, /C1 XOR C2 = P1 XOR P2/);
  assert.match(report, /crib dragging/);
  assert.doesNotMatch(report, /SHOULD_NOT_LOAD/);
  assert.doesNotMatch(report, /UNRELATED/);
});

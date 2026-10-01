import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ORCHESTRATOR_SKILL,
  skillNameForChallenge,
  skillNamesForChallenge,
  detectInstalledSkill,
  verifySkillProof,
} from "../src/skill-route.js";

test("routes normal solves through ctf-solve plus one primary category skill", () => {
  assert.equal(ORCHESTRATOR_SKILL, "ctf-solve");
  assert.deepEqual(skillNamesForChallenge({ category: "crypto" }), ["ctf-solve", "ctf-crypto"]);
  assert.deepEqual(skillNamesForChallenge({ category: "PWN" }), ["ctf-solve", "ctf-pwn"]);
  assert.deepEqual(skillNamesForChallenge({ category: "unknown" }), ["ctf-solve"]);
  assert.equal(skillNameForChallenge({ category: "crypto" }), "ctf-crypto");
});

test("detects repo-scoped skill in documented .agents/skills path", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-skill-route-"));
  const cwd = path.join(root, "repo", "runs", "x", "workspace");
  const skill = path.join(root, "repo", ".agents", "skills", "ctf-crypto", "SKILL.md");
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(skill, "---\nname: ctf-crypto\n---\n");

  const result = detectInstalledSkill("ctf-crypto", cwd);
  assert.equal(result.found, true);
  assert.equal(result.path, skill);
});

test("verifies proof for orchestrator and category skills", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-skill-proof-"));
  const solve = path.join(root, "ctf-solve", "SKILL.md");
  const crypto = path.join(root, "ctf-crypto", "SKILL.md");
  fs.mkdirSync(path.dirname(solve), { recursive: true });
  fs.mkdirSync(path.dirname(crypto), { recursive: true });
  fs.writeFileSync(solve, "skill");
  fs.writeFileSync(crypto, "skill");

  fs.writeFileSync(
    path.join(root, "SKILL_PROOF.md"),
    `CTF_RACER_SKILL=ctf-solve|${solve}\nCTF_RACER_SKILL=ctf-crypto|${crypto}\n`
  );

  const result = verifySkillProof(root, ["ctf-solve", "ctf-crypto"]);
  assert.equal(result.verified, true);
  assert.equal(result.skills.length, 2);
  assert.ok(result.skills.every((skill) => skill.verified));
});


test("verifies focused reference proof inside the owning skill", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-ref-proof-"));
  const solveRoot = path.join(root, "ctf-solve");
  const cryptoRoot = path.join(root, "ctf-crypto");
  const solve = path.join(solveRoot, "SKILL.md");
  const crypto = path.join(cryptoRoot, "SKILL.md");
  const ref = path.join(cryptoRoot, "lattice-and-lwe.md");

  fs.mkdirSync(solveRoot, { recursive: true });
  fs.mkdirSync(cryptoRoot, { recursive: true });
  fs.writeFileSync(solve, "skill");
  fs.writeFileSync(crypto, "skill");
  fs.writeFileSync(ref, "reference");

  fs.writeFileSync(
    path.join(root, "SKILL_PROOF.md"),
    [
      "CTF_RACER_SKILL=ctf-solve|" + solve,
      "CTF_RACER_SKILL=ctf-crypto|" + crypto,
      "CTF_RACER_REF=ctf-crypto|" + ref,
      "",
    ].join("\n")
  );

  const result = verifySkillProof(root, ["ctf-solve", "ctf-crypto"]);
  assert.equal(result.verified, true);
  assert.equal(result.referenceStatus, "verified");
  assert.equal(result.references.length, 1);
  assert.equal(result.references[0].verified, true);
});

test("rejects focused reference proof outside the owning skill root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-ref-proof-escape-"));
  const cryptoRoot = path.join(root, "ctf-crypto");
  const crypto = path.join(cryptoRoot, "SKILL.md");
  const outside = path.join(root, "other", "reference.md");

  fs.mkdirSync(cryptoRoot, { recursive: true });
  fs.mkdirSync(path.dirname(outside), { recursive: true });
  fs.writeFileSync(crypto, "skill");
  fs.writeFileSync(outside, "reference");

  fs.writeFileSync(
    path.join(root, "SKILL_PROOF.md"),
    "CTF_RACER_SKILL=ctf-crypto|" + crypto + "\n" +
    "CTF_RACER_REF=ctf-crypto|" + outside + "\n"
  );

  const result = verifySkillProof(root, ["ctf-crypto"]);
  assert.equal(result.referenceStatus, "path-not-verifiable");
  assert.equal(result.references[0].verified, false);
});

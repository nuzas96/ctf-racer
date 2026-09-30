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

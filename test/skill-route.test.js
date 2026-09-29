import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { skillNameForChallenge, detectInstalledSkill, verifySkillProof } from "../src/skill-route.js";

test("routes challenge category to installed skill name", () => {
  assert.equal(skillNameForChallenge({ category: "crypto" }), "ctf-crypto");
  assert.equal(skillNameForChallenge({ category: "PWN" }), "ctf-pwn");
  assert.equal(skillNameForChallenge({ category: "unknown" }), null);
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

test("verifies skill proof only when the reported skill path exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-skill-proof-"));
  const skill = path.join(root, "ctf-crypto", "SKILL.md");
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, "skill");

  fs.writeFileSync(
    path.join(root, "SKILL_PROOF.md"),
    `CTF_RACER_SKILL_NAME=ctf-crypto\nCTF_RACER_SKILL_PATH=${skill}\n`
  );

  const result = verifySkillProof(root, "ctf-crypto");
  assert.equal(result.verified, true);
  assert.equal(result.skillPath, skill);
});

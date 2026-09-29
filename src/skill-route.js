import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CATEGORY_SKILLS = {
  crypto: "ctf-crypto",
  web: "ctf-web",
  pwn: "ctf-pwn",
  reverse: "ctf-reverse",
  rev: "ctf-reverse",
  forensics: "ctf-forensics",
  osint: "ctf-osint",
  misc: "ctf-misc",
  boot2root: "ctf-boot2root",
};

export function skillNameForChallenge(challenge) {
  const category = String(challenge?.category ?? "").trim().toLowerCase();
  return CATEGORY_SKILLS[category] ?? null;
}

function repoSkillCandidates(cwd, skillName) {
  const candidates = [];
  let current = path.resolve(cwd);

  while (true) {
    candidates.push(path.join(current, ".agents", "skills", skillName, "SKILL.md"));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return candidates;
}

export function detectInstalledSkill(skillName, cwd = process.cwd()) {
  if (!skillName) return { found: false, path: null, checked: [] };

  const checked = [
    ...repoSkillCandidates(cwd, skillName),
    path.join(os.homedir(), ".agents", "skills", skillName, "SKILL.md"),
    path.join(os.homedir(), ".codex", "skills", skillName, "SKILL.md"),
  ];

  for (const candidate of checked) {
    if (fs.existsSync(candidate)) {
      return { found: true, path: path.resolve(candidate), checked };
    }
  }

  return { found: false, path: null, checked };
}

function parseProof(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index < 1) continue;
    values[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return values;
}

export function verifySkillProof(workspace, expectedSkillName) {
  const proofPath = path.join(workspace, "SKILL_PROOF.md");
  if (!fs.existsSync(proofPath)) {
    return { verified: false, status: "missing", proofPath, skillPath: null };
  }

  const values = parseProof(fs.readFileSync(proofPath, "utf8"));
  const name = values.CTF_RACER_SKILL_NAME;
  const skillPath = values.CTF_RACER_SKILL_PATH;

  if (name !== expectedSkillName) {
    return { verified: false, status: "wrong-name", proofPath, skillPath: skillPath ?? null };
  }
  if (!skillPath || !path.isAbsolute(skillPath) || !fs.existsSync(skillPath)) {
    return { verified: false, status: "path-not-verifiable", proofPath, skillPath: skillPath ?? null };
  }

  return {
    verified: true,
    status: "verified",
    proofPath,
    skillPath: path.resolve(skillPath),
  };
}

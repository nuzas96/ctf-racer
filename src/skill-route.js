import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ORCHESTRATOR_SKILL = "ctf-solve";

const CATEGORY_SKILLS = {
  crypto: "ctf-crypto",
  web: "ctf-web",
  pwn: "ctf-pwn",
  reverse: "ctf-reverse",
  rev: "ctf-reverse",
  forensics: "ctf-forensics",
  osint: "ctf-osint",
  misc: "ctf-misc",
  malware: "ctf-malware",
  "ai-ml": "ctf-ai-ml",
  boot2root: "ctf-boot2root",
};

export function skillNameForChallenge(challenge) {
  const category = String(challenge?.category ?? "").trim().toLowerCase();
  return CATEGORY_SKILLS[category] ?? null;
}

export function skillNamesForChallenge(challenge) {
  const categorySkill = skillNameForChallenge(challenge);
  return categorySkill ? [ORCHESTRATOR_SKILL, categorySkill] : [ORCHESTRATOR_SKILL];
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
  const skills = [];
  const references = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("CTF_RACER_SKILL=")) {
      const raw = line.slice("CTF_RACER_SKILL=".length).trim();
      const divider = raw.indexOf("|");
      if (divider > 0) {
        skills.push({
          name: raw.slice(0, divider).trim(),
          path: raw.slice(divider + 1).trim(),
        });
      }
    }
    if (line.startsWith("CTF_RACER_REF=")) {
      const raw = line.slice("CTF_RACER_REF=".length).trim();
      const divider = raw.indexOf("|");
      if (divider > 0) {
        references.push({
          skill: raw.slice(0, divider).trim(),
          path: raw.slice(divider + 1).trim(),
        });
      }
    }
  }

  // Backward compatibility with the first single-skill proof format.
  const legacyName = text.match(/^CTF_RACER_SKILL_NAME=(.+)$/m)?.[1]?.trim();
  const legacyPath = text.match(/^CTF_RACER_SKILL_PATH=(.+)$/m)?.[1]?.trim();
  if (legacyName && legacyPath) skills.push({ name: legacyName, path: legacyPath });

  return { skills, references };
}

export function verifySkillProof(workspace, expectedSkillNames) {
  const expected = Array.isArray(expectedSkillNames)
    ? expectedSkillNames.filter(Boolean)
    : [expectedSkillNames].filter(Boolean);
  const proofPath = path.join(workspace, "SKILL_PROOF.md");

  if (!fs.existsSync(proofPath)) {
    return { verified: false, status: "missing", proofPath, skills: [], references: [], referenceStatus: "none-reported" };
  }

  const reported = parseProof(fs.readFileSync(proofPath, "utf8"));
  const skills = expected.map((name) => {
    const match = reported.skills.find((item) => item.name === name);
    const validPath = Boolean(
      match?.path &&
      path.isAbsolute(match.path) &&
      fs.existsSync(match.path)
    );
    return {
      name,
      path: match?.path ?? null,
      verified: validPath,
    };
  });

  const references = reported.references.map((item) => {
    const owner = skills.find((skill) => skill.name === item.skill && skill.verified);
    const root = owner?.path ? path.dirname(owner.path) : null;
    const refPath = item.path && path.isAbsolute(item.path) ? path.resolve(item.path) : null;
    const insideOwner = Boolean(
      root &&
      refPath &&
      (refPath === root || refPath.startsWith(root + path.sep))
    );
    const valid = Boolean(insideOwner && fs.existsSync(refPath) && fs.statSync(refPath).isFile());
    return {
      skill: item.skill,
      path: item.path ?? null,
      verified: valid,
    };
  });

  const verified = skills.length > 0 && skills.every((skill) => skill.verified);
  let status = "verified";
  if (!verified) {
    status = skills.some((skill) => !skill.path) ? "missing-skill-proof" : "path-not-verifiable";
  }

  const referenceStatus =
    references.length === 0 ? "none-reported" :
    references.every((item) => item.verified) ? "verified" :
    "path-not-verifiable";

  return { verified, status, proofPath, skills, references, referenceStatus };
}

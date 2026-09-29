import fs from "node:fs";
import path from "node:path";

function firstExisting(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return path.resolve(candidate);
  }
  return null;
}

function section(markdown, heading) {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  if (start < 0) return "";
  const next = markdown.indexOf("\n## ", start + marker.length);
  return markdown.slice(start, next >= 0 ? next : markdown.length).trim();
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
}

export function resolveSkillLibrary(projectRoot, policy = {}) {
  const configured = policy.skill_library_path
    ? path.resolve(projectRoot, policy.skill_library_path)
    : null;

  return firstExisting([
    process.env.CTF_RACER_SKILLS_PATH,
    configured,
    path.join(projectRoot, "..", "codex-skills"),
    path.join(projectRoot, "..", "codex-skills-github"),
  ]);
}

function cryptoBundle(skillRoot, preflight) {
  const parts = [];
  const routerFile = path.join(skillRoot, "ctf-crypto", "SKILL.md");
  const router = readIfExists(routerFile);

  if (router) {
    for (const name of [
      "First pass",
      "Technique router",
      "Core classification questions",
      "Block cipher / MAC discipline",
    ]) {
      const s = section(router, name);
      if (s) parts.push(s);
    }
  }

  const reusedNonce = preflight.findings?.some((finding) => finding.type === "reused-nonce");
  if (reusedNonce) {
    const modern = readIfExists(path.join(skillRoot, "ctf-crypto", "modern-ciphers.md"));
    const classic = readIfExists(path.join(skillRoot, "ctf-crypto", "classic-ciphers.md"));

    const gcmReuse = section(modern, "AES-GCM Nonce Reuse / Forbidden Attack");
    if (gcmReuse) parts.push(gcmReuse);

    const manyTimePad = section(classic, "OTP Key Reuse / Many-Time Pad XOR (BYPASS CTF 2025)");
    if (manyTimePad) parts.push(manyTimePad);
  }

  return parts;
}

export function retrieveSkills({ projectRoot, workspace, challenge, preflight, policy = {} }) {
  const skillRoot = resolveSkillLibrary(projectRoot, policy);
  const output = path.join(workspace, "SKILLS.md");

  if (!skillRoot) {
    fs.writeFileSync(
      output,
      "# Retrieved CTF skills\n\nNo local codex-skills V2 repository was found.\n"
    );
    return { foundLibrary: false, source: null, sections: 0, output };
  }

  let parts = [];
  if (challenge.category === "crypto") {
    parts = cryptoBundle(skillRoot, preflight);
  }

  const header = [
    "# Retrieved CTF skills",
    "",
    `Source: ${skillRoot}`,
    `Category: ${challenge.category ?? "unknown"}`,
    "",
    "Only technique sections relevant to deterministic preflight signals are included to control context size.",
    "",
  ].join("\n");

  fs.writeFileSync(output, header + parts.join("\n\n---\n\n") + "\n");

  return {
    foundLibrary: true,
    source: skillRoot,
    sections: parts.length,
    output,
  };
}

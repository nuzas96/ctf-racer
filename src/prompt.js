function normalizeSkills(skillNames) {
  return Array.isArray(skillNames) ? skillNames.filter(Boolean) : [];
}

function skillInstruction(skillNames) {
  const skills = normalizeSkills(skillNames);
  if (skills.length === 0) return "";

  const invocation = skills.map((name) => `$${name}`).join(" then ");
  const proofLines = skills.map((name) => `CTF_RACER_SKILL=${name}|<exact SKILL.md path>`).join("\n");

  return `Explicitly invoke the installed skills in this order: ${invocation}. The canonical solve lifecycle belongs to $ctf-solve; the category skill supplies domain technique routing. Do not replace either with copied skill text. After Codex has loaded them, create SKILL_PROOF.md with exactly one line per loaded skill using the exact path/location shown by the available-skills catalog:\n${proofLines}\nDo not invent paths. If a requested skill is unavailable, record CTF_RACER_SKILL=<name>|UNAVAILABLE and continue with the best locally available route.\n\n`;
}

function progressContract() {
  return `Follow $ctf-solve progress discipline. PROGRESS.md is the canonical persistent solve log. After each meaningful test, append important evidence, dead ends, pivots, exact values, and verification status there. If you do not have the flag, end with exactly one runner status line: CTF_RACER_PROGRESS=<one concrete newly validated fact, primitive, recovered value, or experiment result> when measurable progress was made, or CTF_RACER_STALLED=<specific blocker> when no new measurable progress was made.\n\n`;
}

function steeringInstruction(previousAssessment) {
  if (!previousAssessment) return "";

  let instruction = "";
  if (previousAssessment.rejectedFlag) {
    instruction += `The controller independently rejected the previous flag candidate ${previousAssessment.rejectedFlag}. Treat that candidate as disproven evidence; do not emit it again unless new evidence changes the verifier result. Continue from the strongest validated state.\n\n`;
  }

  if (previousAssessment.stalled) {
    const reasons = previousAssessment.reasons?.join("; ") || "no measurable progress";
    instruction += `The controller detected a stall in the previous round: ${reasons}. Keep the same persistent solve state. Use $ctf-solve's evidence-first and stuck-recovery discipline to choose the next justified path; do not repeat the same command/payload/hypothesis without new evidence. Preserve validated evidence in PROGRESS.md. Do not declare the challenge blocked until the canonical stuck-recovery gate has been applied when appropriate.\n\n`;
  }

  return instruction;
}

export function initialPrompt(challenge, policy, skillNames = []) {
  return `Solve the authorized CTF challenge in this workspace.\n\n` +
    skillInstruction(skillNames) +
    `Read CHALLENGE.md, PREFLIGHT.md, the minimal PROGRESS.md, and the supplied artifacts. Treat PREFLIGHT.md as deterministic evidence gathered before the model starts, not as a second solver. Let $ctf-solve own lifecycle/progress/pivots/stuck recovery and let the primary category skill select the smallest focused reference needed by evidence. Do not preload the whole skill library. Use shell/local tools autonomously and keep useful scripts/results in solve/. Do not ask the operator to run commands you can run yourself.\n\n` +
    progressContract() +
    `Competition policy for this run:\n` +
    `- external web research: ${policy.allow_external_web_research ? "allowed" : "disabled"}\n` +
    `- challenge network access: ${policy.allow_challenge_network ? "allowed" : "disabled"}\n` +
    `- automatic submission: ${policy.auto_submit ? "allowed" : "disabled"}\n\n` +
    `If a network target appears in CHALLENGE.md but challenge network access is disabled, do not contact it; solve as far as possible locally. If you find and verify a concrete recovered flag, finish with CTF_RACER_FLAG=<flag>. Never emit the advertised format placeholder as a recovered flag.`;
}

export function continuationPrompt(round, skillNames = [], previousAssessment) {
  const skills = normalizeSkills(skillNames);
  const skillReminder = skills.length
    ? `Continue using ${skills.map((name) => `$${name}`).join(" + ")} according to their canonical roles. `
    : "";

  return `Continue solving the same challenge as the same persistent agent. This is continuation round ${round}. ` +
    skillReminder +
    steeringInstruction(previousAssessment) +
    `Re-read PROGRESS.md and relevant existing files before acting. Continue the evidence-first loop from the strongest validated state; do not restart broad exploration or preload unrelated skills. ` +
    progressContract() +
    `If you verify a concrete recovered flag, finish with CTF_RACER_FLAG=<flag>. Never emit the advertised format placeholder as a recovered flag.`;
}

function skillInstruction(skillName) {
  if (!skillName) return "";

  return `Explicitly invoke the installed $${skillName} skill before solving. After Codex has loaded that skill, create SKILL_PROOF.md with exactly these two lines, using the exact skill path/location shown by the available-skills catalog:\nCTF_RACER_SKILL_NAME=${skillName}\nCTF_RACER_SKILL_PATH=<exact SKILL.md path>\nDo not invent a path. If the skill is unavailable in this session, write CTF_RACER_SKILL_NAME=UNAVAILABLE instead and continue with the best local approach.\n\n`;
}

function progressContract() {
  return `If you do not have the flag, end with exactly one status line. Use CTF_RACER_PROGRESS=<one concrete newly validated fact, primitive, recovered value, or experiment result> when you made measurable progress. Use CTF_RACER_STALLED=<specific blocker> only when you made no new measurable progress. Keep validated evidence in FINDINGS.md and useful scripts/results in solve/.\n\n`;
}

function steeringInstruction(previousAssessment) {
  if (!previousAssessment?.stalled) return "";
  const reasons = previousAssessment.reasons?.join("; ") || "no measurable progress";
  return `The controller detected a stall in the previous round: ${reasons}. Do not repeat the same commands, hypothesis, or analysis path. Preserve validated findings, explicitly abandon or deprioritize the stalled path, then choose a different falsifiable hypothesis or a materially different experiment using PREFLIGHT.md and the installed skill.\n\n`;
}

export function initialPrompt(challenge, policy, skillName) {
  return `Solve the authorized CTF challenge in this workspace.\n\n` +
    skillInstruction(skillName) +
    `Start by reading CHALLENGE.md, AGENTS.md, PREFLIGHT.md, FINDINGS.md, and the artifacts directory. ` +
    `Treat PREFLIGHT.md as deterministic triage evidence. Let the installed Codex skill provide the reusable technique guidance; do not expect a copied SKILLS.md file. ` +
    `Use the shell and local tools as needed. Work autonomously and keep useful files in solve/. ` +
    `Do not ask the operator to run commands you can run yourself.\n\n` +
    progressContract() +
    `Competition policy for this run:\n` +
    `- external web research: ${policy.allow_external_web_research ? "allowed" : "disabled"}\n` +
    `- challenge network access: ${policy.allow_challenge_network ? "allowed" : "disabled"}\n` +
    `- automatic submission: ${policy.auto_submit ? "allowed" : "disabled"}\n\n` +
    `If a network target appears in CHALLENGE.md but challenge network access is disabled, do not contact it; solve as far as possible locally. ` +
    `If you find and verify a concrete recovered flag, finish with CTF_RACER_FLAG=<flag>. Never emit the advertised format placeholder as a recovered flag.`;
}

export function continuationPrompt(round, skillName, previousAssessment) {
  const skillReminder = skillName
    ? `Continue using the already loaded $${skillName} skill when its guidance remains relevant. `
    : "";

  return `Continue solving the same challenge as the same persistent agent. This is continuation round ${round}. ` +
    skillReminder +
    steeringInstruction(previousAssessment) +
    `Re-read PREFLIGHT.md, your existing files, and FINDINGS.md first. Do not repeat disproven work. ` +
    progressContract() +
    `If you verify a concrete recovered flag, finish with CTF_RACER_FLAG=<flag>. Never emit the advertised format placeholder as a recovered flag.`;
}

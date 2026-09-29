export function initialPrompt(challenge, policy) {
  return `Solve the authorized CTF challenge in this workspace.\n\n` +
    `Start by reading CHALLENGE.md, AGENTS.md, PREFLIGHT.md, FINDINGS.md, and the artifacts directory. ` +
    `Treat PREFLIGHT.md as deterministic triage evidence and verify its security implication with the artifact before committing to an exploit path. ` +
    `Use the shell and local tools as needed. Work autonomously and keep useful files in solve/. ` +
    `Do not ask the operator to run commands you can run yourself.\n\n` +
    `Competition policy for this run:\n` +
    `- external web research: ${policy.allow_external_web_research ? "allowed" : "disabled"}\n` +
    `- challenge network access: ${policy.allow_challenge_network ? "allowed" : "disabled"}\n` +
    `- automatic submission: ${policy.auto_submit ? "allowed" : "disabled"}\n\n` +
    `If a network target appears in CHALLENGE.md but challenge network access is disabled, do not contact it; solve as far as possible locally. ` +
    `If you find and verify the flag, finish with CTF_RACER_FLAG=<flag>.`;
}

export function continuationPrompt(round) {
  return `Continue solving the same challenge as the same persistent agent. This is continuation round ${round}. ` +
    `Re-read PREFLIGHT.md, your existing files, and FINDINGS.md first. Do not repeat disproven work. ` +
    `If the previous path stalled, choose a different falsifiable hypothesis or experiment. ` +
    `If you verify the flag, finish with CTF_RACER_FLAG=<flag>.`;
}

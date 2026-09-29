import fs from "node:fs";
import path from "node:path";
import { safeChallengeId } from "./challenge.js";

function copyDirContents(source, destination) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dst = path.join(destination, entry.name);
    if (entry.isDirectory()) fs.cpSync(src, dst, { recursive: true });
    else fs.copyFileSync(src, dst);
  }
}

export function makeChallengeMarkdown(challenge) {
  const target = challenge.target
    ? `\n## Target\n\n${JSON.stringify(challenge.target, null, 2)}\n`
    : "";

  return `# ${challenge.title}\n\n` +
    `- ID: ${challenge.id}\n` +
    `- Category: ${challenge.category ?? "unknown"}\n` +
    `- Flag format: ${challenge.flag_format ?? "not supplied"}\n\n` +
    `## Description\n\n${challenge.description}\n` +
    target +
    (challenge.notes ? `\n## Operator notes\n\n${challenge.notes}\n` : "");
}

export function makeAgentInstructions() {
  return `# CTF Racer Agent Instructions\n\n` +
    `You are the single persistent solver assigned to this challenge.\n\n` +
    `Rules:\n` +
    `- This workspace is for an authorized CTF challenge only.\n` +
    `- Work only on the challenge described in CHALLENGE.md and artifacts in artifacts/.\n` +
    `- Prefer evidence-driven experiments over speculation.\n` +
    `- Keep useful scripts under solve/.\n` +
    `- Record concise validated discoveries in FINDINGS.md.\n` +
    `- Do not erase useful prior state unless replacing it with a better result.\n` +
    `- When you have a candidate flag, verify it locally when possible.\n` +
    `- When verified, include exactly one line in your final response: CTF_RACER_FLAG=<flag>\n` +
    `- If not solved yet, state the strongest confirmed primitive/evidence and the next experiment.\n`;
}

export function prepareWorkspace(projectRoot, sourceDir, challenge) {
  const runRoot = path.join(projectRoot, "runs", safeChallengeId(challenge.id));
  const workspace = path.join(runRoot, "workspace");
  const artifacts = path.join(workspace, "artifacts");

  fs.mkdirSync(path.join(workspace, "solve"), { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });
  copyDirContents(path.join(sourceDir, challenge.files_dir ?? "files"), artifacts);

  fs.writeFileSync(path.join(workspace, "CHALLENGE.md"), makeChallengeMarkdown(challenge));
  fs.writeFileSync(path.join(workspace, "AGENTS.md"), makeAgentInstructions());
  if (!fs.existsSync(path.join(workspace, "FINDINGS.md"))) {
    fs.writeFileSync(path.join(workspace, "FINDINGS.md"), "# Validated findings\n\n");
  }

  const now = new Date().toISOString();
  const state = {
    challenge_id: challenge.id,
    status: "prepared",
    created_at: now,
    updated_at: now,
    workspace,
    rounds: 0,
  };
  writeState(runRoot, state);
  return state;
}

export function writeState(runRoot, state) {
  state.updated_at = new Date().toISOString();
  fs.mkdirSync(runRoot, { recursive: true });
  fs.writeFileSync(path.join(runRoot, "state.json"), JSON.stringify(state, null, 2) + "\n");
}

export function appendRunLog(runRoot, message) {
  fs.appendFileSync(path.join(runRoot, "run.log"), `[${new Date().toISOString()}] ${message}\n`);
}

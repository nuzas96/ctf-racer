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
    `You are the single persistent solver assigned to this authorized CTF challenge.\n\n` +
    `- Use $ctf-solve for solve lifecycle, evidence-first iterations, PROGRESS.md discipline, pivots and stuck recovery.\n` +
    `- Use exactly one primary category skill unless concrete evidence proves a cross-category boundary.\n` +
    `- Read PREFLIGHT.md as deterministic observation supplied by the controller.\n` +
    `- PROGRESS.md is the canonical persistent solve log; append important evidence instead of rewriting history.\n` +
    `- Work only on CHALLENGE.md and artifacts/.\n` +
    `- Keep useful scripts/results under solve/.\n` +
    `- Verify candidate flags locally when possible.\n` +
    `- When verified, include exactly one final line: CTF_RACER_FLAG=<flag>\n`;
}

export function prepareWorkspace(projectRoot, sourceDir, challenge) {
  const runRoot = path.join(projectRoot, "runs", safeChallengeId(challenge.id));
  const workspace = path.join(runRoot, "workspace");
  const artifacts = path.join(workspace, "artifacts");

  if (fs.existsSync(runRoot)) {
    const historyRoot = path.join(projectRoot, "runs", "_history", safeChallengeId(challenge.id));
    fs.mkdirSync(historyRoot, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    fs.renameSync(runRoot, path.join(historyRoot, stamp));
  }

  fs.mkdirSync(path.join(workspace, "solve"), { recursive: true });
  fs.mkdirSync(artifacts, { recursive: true });
  copyDirContents(path.join(sourceDir, challenge.files_dir ?? "files"), artifacts);

  fs.writeFileSync(path.join(workspace, "CHALLENGE.md"), makeChallengeMarkdown(challenge));
  fs.writeFileSync(path.join(workspace, "AGENTS.md"), makeAgentInstructions());
  fs.writeFileSync(path.join(workspace, "PROGRESS.md"), "# Progress\n\n");

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

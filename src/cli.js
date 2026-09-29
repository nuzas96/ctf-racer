#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChallenge, safeChallengeId } from "./challenge.js";
import { loadPolicy } from "./config.js";
import { CodexAgentSession } from "./agent.js";
import { prepareWorkspace, writeState } from "./workspace.js";
import { runPreflight } from "./preflight.js";
import { detectInstalledSkill, skillNameForChallenge, verifySkillProof } from "./skill-route.js";
import { solveChallenge } from "./runner.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

function usage() {
  console.error("Usage: npm run racer -- solve <challenge-directory>");
  process.exit(2);
}

function seconds(ms) {
  return (ms / 1000).toFixed(2);
}

const [, , command, sourceArg] = process.argv;
if (command !== "solve" || !sourceArg) usage();

const sourceDir = path.resolve(process.cwd(), sourceArg);
if (!fs.existsSync(sourceDir)) throw new Error(`Challenge directory not found: ${sourceDir}`);

const challenge = loadChallenge(sourceDir);
const policy = loadPolicy(projectRoot);
if (!policy.authorized_ctf_only) throw new Error("V1 requires authorized_ctf_only=true");

const state = prepareWorkspace(projectRoot, sourceDir, challenge);
const runRoot = path.join(projectRoot, "runs", safeChallengeId(challenge.id));
const preflight = runPreflight(state.workspace, challenge);
state.preflight = {
  finding_count: preflight.findingCount,
  high_count: preflight.highCount,
};

const skillName = skillNameForChallenge(challenge);
const installedSkill = detectInstalledSkill(skillName, state.workspace);
state.skill_route = {
  expected_skill: skillName,
  local_detected: installedSkill.found,
  local_path: installedSkill.path,
};
writeState(runRoot, state);

const session = await CodexAgentSession.create(state.workspace, policy);

console.log(`[ctf-racer] challenge: ${challenge.title}`);
console.log(`[ctf-racer] workspace: ${state.workspace}`);
console.log(`[ctf-racer] model: ${policy.model ?? "Codex default/profile"}`);
console.log(`[ctf-racer] reasoning: ${policy.model_reasoning_effort ?? "profile/default"}`);
console.log(`[ctf-racer] policy: one challenge -> one persistent Codex thread`);
console.log(`[ctf-racer] preflight: ${preflight.findingCount} finding(s), ${preflight.highCount} high-confidence`);
console.log(`[ctf-racer] skill route: ${skillName ? `${skillName}` : "none"}${installedSkill.found ? ` (${installedSkill.path})` : " (not detected in local documented paths)"}`);

const result = await solveChallenge({ challenge, policy, state, runRoot, session, skillName });
console.log(`[ctf-racer] rounds: ${result.state.rounds}`);
console.log(`[ctf-racer] elapsed: ${seconds(result.state.elapsed_ms ?? 0)}s`);

if (skillName) {
  const proof = verifySkillProof(state.workspace, skillName);
  result.state.skill_proof = {
    verified: proof.verified,
    status: proof.status,
    path: proof.skillPath,
  };
  writeState(runRoot, result.state);
  console.log(`[ctf-racer] skill proof: ${proof.status}${proof.skillPath ? ` (${proof.skillPath})` : ""}`);
}

if (result.state.status === "solved") {
  console.log(`\n[ctf-racer] SOLVED: ${result.state.flag}`);
  process.exit(0);
}

console.log(`\n[ctf-racer] ${result.state.status.toUpperCase()} after ${result.state.rounds} persistent rounds.`);
console.log(`[ctf-racer] inspect: ${runRoot}`);
process.exit(result.state.status === "error" ? 1 : 3);

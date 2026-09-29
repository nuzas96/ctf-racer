#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChallenge, safeChallengeId } from "./challenge.js";
import { loadPolicy } from "./config.js";
import { CodexAgentSession } from "./agent.js";
import { prepareWorkspace } from "./workspace.js";
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
const session = await CodexAgentSession.create(state.workspace, policy);

console.log(`[ctf-racer] challenge: ${challenge.title}`);
console.log(`[ctf-racer] workspace: ${state.workspace}`);
console.log(`[ctf-racer] model: Codex default/profile`);
console.log(`[ctf-racer] policy: one challenge -> one persistent Codex thread`);

const result = await solveChallenge({ challenge, policy, state, runRoot, session });
console.log(`[ctf-racer] rounds: ${result.state.rounds}`);
console.log(`[ctf-racer] elapsed: ${seconds(result.state.elapsed_ms ?? 0)}s`);

if (result.state.status === "solved") {
  console.log(`\n[ctf-racer] SOLVED: ${result.state.flag}`);
  process.exit(0);
}

console.log(`\n[ctf-racer] ${result.state.status.toUpperCase()} after ${result.state.rounds} persistent rounds.`);
console.log(`[ctf-racer] inspect: ${runRoot}`);
process.exit(result.state.status === "error" ? 1 : 3);

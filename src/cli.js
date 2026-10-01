#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadChallenge, safeChallengeId } from "./challenge.js";
import { loadPolicy, policyForChallenge } from "./config.js";
import { CodexAgentSession } from "./agent.js";
import { prepareWorkspace, writeState } from "./workspace.js";
import { runPreflight } from "./preflight.js";
import { detectInstalledSkill, skillNamesForChallenge, verifySkillProof } from "./skill-route.js";
import { solveChallenge } from "./runner.js";
import { inspectLatestBenchmark, runBenchmark } from "./benchmark.js";
import { assertChallengeArtifacts, fetchChallengeArtifacts, importSingleArtifact } from "./artifacts.js";
import { fetchSuiteArtifacts, precheckSuite, runSuite } from "./suite.js";
import { assertChallengeServiceFiles, fetchChallengeServiceFiles, startChallengeService, stopChallengeService, withChallengeService } from "./service.js";
import { runRace } from "./race.js";
import { discoverIntakeChallenges, raceStatus, writeIntakeSuite } from "./intake.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

function usage() {
  console.error("Usage:");
  console.error("  npm run racer -- solve <challenge-directory>");
  console.error("  npm run racer -- inspect <challenge-directory>");
  console.error("  npm run racer -- benchmark <challenge-directory> [--runs N]");
  console.error("  npm run racer -- benchmark-inspect <challenge-directory>");
  console.error("  npm run racer -- benchmark-import <challenge-directory> --source <artifact>");
  console.error("  npm run racer -- suite-fetch <suite.json>");
  console.error("  npm run racer -- suite-check <suite.json>");
  console.error("  npm run racer -- suite <suite.json> [--runs N]");
  console.error("  npm run racer -- race <suite.json> [--concurrency N] [--fresh-retries N]");
  console.error("  npm run racer -- intake <challenge-root> [--concurrency N] [--fresh-retries N]");
  console.error("  npm run racer -- intake-check <challenge-root>");
  console.error("  npm run racer -- race-status <suite-or-intake.json>");
  console.error("  npm run racer -- service-fetch <challenge-directory>");
  console.error("  npm run racer -- service-check <challenge-directory>");
  console.error("  npm run racer -- service-smoke <challenge-directory>");
  process.exit(2);
}

function seconds(ms) {
  return (ms / 1000).toFixed(2);
}

function listFiles(root, base = root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, base));
    else if (entry.isFile()) out.push(path.relative(base, full));
  }
  return out.sort();
}

function inspectRun(sourceDir) {
  const challenge = loadChallenge(sourceDir);
  const runRoot = path.join(projectRoot, "runs", safeChallengeId(challenge.id));
  const statePath = path.join(runRoot, "state.json");

  if (!fs.existsSync(statePath)) {
    throw new Error(`No current run state found for ${challenge.id}: ${statePath}`);
  }

  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const workspace = state.workspace || path.join(runRoot, "workspace");
  const progressPath = path.join(workspace, "PROGRESS.md");
  const legacyFindingsPath = path.join(workspace, "FINDINGS.md");
  const solveDir = path.join(workspace, "solve");

  console.log(`[ctf-racer] inspect: ${challenge.title}`);
  console.log(`[ctf-racer] status: ${state.status}`);
  console.log(`[ctf-racer] rounds: ${state.rounds ?? 0}`);
  console.log(`[ctf-racer] elapsed: ${seconds(state.elapsed_ms ?? 0)}s`);
  console.log(`[ctf-racer] stalls: ${state.stall_count ?? 0}`);
  console.log(`[ctf-racer] rejected candidates: ${(state.rejected_candidates ?? []).length}`);

  const diagnostics = state.round_diagnostics ?? [];
  console.log("\n[ctf-racer] round diagnostics:");
  if (diagnostics.length === 0) {
    console.log("  (none recorded)");
  } else {
    for (const d of diagnostics) {
      const signal = d.progress_marker
        ? `progress=${d.progress_marker}`
        : d.stalled_marker
          ? `stalled=${d.stalled_marker}`
          : "no marker";
      const reasons = d.reasons?.length ? ` reasons=${d.reasons.join(" | ")}` : "";
      console.log(
        `  r${d.round}: stalled=${d.stalled} workspace_changed=${d.workspace_changed} similarity=${d.max_response_similarity} ${signal}${reasons}`
      );
    }
  }

  console.log("\n[ctf-racer] PROGRESS.md:");
  const progressFile = fs.existsSync(progressPath) ? progressPath : legacyFindingsPath;
  if (fs.existsSync(progressFile)) {
    const progress = fs.readFileSync(progressFile, "utf8").trim();
    console.log(progress || "(empty)");
  } else {
    console.log("(missing)");
  }

  console.log("\n[ctf-racer] solve/ files:");
  const files = listFiles(solveDir, solveDir);
  if (files.length === 0) console.log("  (none)");
  else for (const file of files) console.log(`  - ${file}`);

  console.log(`\n[ctf-racer] full run: ${runRoot}`);
}

const [, , command, sourceArg, ...restArgs] = process.argv;
if (!["solve", "inspect", "benchmark", "benchmark-inspect", "benchmark-import", "suite-fetch", "suite-check", "suite", "race", "intake", "intake-check", "race-status", "service-fetch", "service-check", "service-smoke"].includes(command) || !sourceArg) usage();

function parseIntegerOption(args, name, { min, max, fallback }) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function parseBenchmarkRuns(args, defaultRuns = 5) {
  const index = args.indexOf("--runs");
  if (index === -1) return defaultRuns;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1 || value > 50) {
    throw new Error("--runs must be an integer from 1 to 50");
  }
  return value;
}

if (command === "intake-check") {
  const intakeRoot = path.resolve(process.cwd(), sourceArg);
  const discovered = discoverIntakeChallenges(intakeRoot);
  console.log("[ctf-racer] intake check: ok");
  console.log("[ctf-racer] intake root: " + discovered.root);
  console.log("[ctf-racer] discovered challenges: " + discovered.entries.length);
  for (const entry of discovered.entries) {
    console.log("[ctf-racer] intake: " + entry.challenge_id + " category=" + entry.category + " path=" + entry.path);
  }
  process.exit(0);
}

if (command === "intake") {
  const intakeRoot = path.resolve(process.cwd(), sourceArg);
  const discovered = discoverIntakeChallenges(intakeRoot);
  const generated = writeIntakeSuite(projectRoot, intakeRoot, discovered);
  const concurrency = parseIntegerOption(restArgs, "--concurrency", { min: 1, max: 32, fallback: undefined });
  const freshRetries = parseIntegerOption(restArgs, "--fresh-retries", { min: 0, max: 3, fallback: undefined });

  console.log("[ctf-racer] intake root: " + discovered.root);
  console.log("[ctf-racer] discovered challenges: " + discovered.entries.length);
  for (const entry of discovered.entries) {
    console.log("[ctf-racer] intake: " + entry.challenge_id + " category=" + entry.category + " path=" + entry.path);
  }
  console.log("[ctf-racer] intake manifest: " + generated.outputPath);

  const result = await runRace({
    projectRoot,
    suitePath: generated.outputPath,
    concurrency,
    freshRetries,
  });

  console.log("\n[ctf-racer] intake race summary");
  console.log("[ctf-racer] verified challenges: " + result.verified_challenges + "/" + result.total_challenges);
  console.log("[ctf-racer] verified challenge rate: " + (result.verified_challenge_rate * 100).toFixed(1) + "%");
  console.log("[ctf-racer] total solver attempts: " + result.total_attempts);
  console.log("[ctf-racer] wall elapsed: " + seconds(result.wall_elapsed_ms) + "s");
  console.log("[ctf-racer] race report: " + result.output_path);
  process.exit(result.verified_challenges === result.total_challenges ? 0 : 3);
}

if (command === "race-status") {
  const status = raceStatus(projectRoot, path.resolve(process.cwd(), sourceArg));
  console.log("[ctf-racer] race status: " + status.id);
  console.log("[ctf-racer] manifest: " + status.manifest);
  for (const item of status.challenges) {
    console.log(
      "[ctf-racer] " + item.challenge_id +
      " category=" + item.category +
      " status=" + item.status +
      " rounds=" + item.rounds +
      " elapsed=" + (item.elapsed_ms === null ? "n/a" : seconds(item.elapsed_ms) + "s") +
      " stalls=" + item.stall_count
    );
    if (item.last_telemetry) console.log("  last: " + item.last_telemetry);
  }
  process.exit(0);
}

if (command === "race") {
  const suitePath = path.resolve(process.cwd(), sourceArg);
  if (!fs.existsSync(suitePath)) throw new Error("Suite file not found: " + suitePath);

  const concurrency = parseIntegerOption(restArgs, "--concurrency", { min: 1, max: 32, fallback: undefined });
  const freshRetries = parseIntegerOption(restArgs, "--fresh-retries", { min: 0, max: 3, fallback: undefined });
  const result = await runRace({ projectRoot, suitePath, concurrency, freshRetries });

  console.log("\n[ctf-racer] race summary");
  console.log("[ctf-racer] race id: " + result.race_id);
  console.log("[ctf-racer] verified challenges: " + result.verified_challenges + "/" + result.total_challenges);
  console.log("[ctf-racer] verified challenge rate: " + (result.verified_challenge_rate * 100).toFixed(1) + "%");
  console.log("[ctf-racer] total solver attempts: " + result.total_attempts);
  console.log("[ctf-racer] wall elapsed: " + seconds(result.wall_elapsed_ms) + "s");
  for (const item of result.challenges) {
    console.log(
      "[ctf-racer] " + item.path +
      " category=" + item.category +
      " verified=" + item.verified +
      " attempts=" + item.attempts.length +
      (item.winning_attempt ? " winning_attempt=" + item.winning_attempt : "")
    );
  }
  console.log("[ctf-racer] race report: " + result.output_path);
  process.exit(result.verified_challenges === result.total_challenges ? 0 : 3);
}

if (command === "suite-fetch" || command === "suite-check" || command === "suite") {
  const suitePath = path.resolve(process.cwd(), sourceArg);
  if (!fs.existsSync(suitePath)) throw new Error("Suite file not found: " + suitePath);

  if (command === "suite-fetch") {
    const fetched = await fetchSuiteArtifacts(projectRoot, suitePath);
    console.log("[ctf-racer] suite: " + fetched.suite_id);
    for (const item of fetched.results) {
      console.log("[ctf-racer] " + item.path + " status=" + item.status + " fetched=" + item.fetched);
    }
    process.exit(0);
  }

  if (command === "suite-check") {
    const check = precheckSuite(projectRoot, suitePath);
    console.log("[ctf-racer] suite: " + check.suite.id);
    for (const entry of check.entries) {
      console.log(
        "[ctf-racer] " + entry.path +
        " category=" + entry.category +
        " required=" + entry.required +
        " artifacts=" + entry.artifact_status +
        (entry.error ? " error=" + entry.error : "")
      );
    }
    const blocked = check.entries.some((entry) => entry.required && entry.artifact_status !== "ok");
    process.exit(blocked ? 3 : 0);
  }

  const runs = parseBenchmarkRuns(restArgs, 1);
  const result = runSuite({ projectRoot, suitePath, runs });
  console.log("\n[ctf-racer] suite summary");
  console.log("[ctf-racer] suite id: " + result.suite_id);
  console.log("[ctf-racer] verified solves: " + result.verified_solves + "/" + result.total_attempts);
  console.log("[ctf-racer] verified solve rate: " + (result.verified_solve_rate * 100).toFixed(1) + "%");
  for (const item of result.benchmarks) {
    console.log(
      "[ctf-racer] " + item.path +
      " category=" + item.category +
      " verified=" + item.summary.verified_solves + "/" + item.summary.total_runs +
      " median_verified_ttf=" +
      (item.summary.median_verified_ttf_ms === null ? "n/a" : seconds(item.summary.median_verified_ttf_ms) + "s")
    );
  }
  console.log("[ctf-racer] suite report: " + result.output_path);
  process.exit(0);
}

const sourceDir = path.resolve(process.cwd(), sourceArg);
if (!fs.existsSync(sourceDir)) throw new Error(`Challenge directory not found: ${sourceDir}`);

if (["service-fetch", "service-check", "service-smoke"].includes(command)) {
  const challenge = loadChallenge(sourceDir);
  if (!challenge.service) throw new Error("challenge has no service");
  if (command === "service-fetch") {
    if (challenge.artifact_manifest?.length) {
      try { assertChallengeArtifacts(sourceDir, challenge); }
      catch { await fetchChallengeArtifacts(sourceDir, challenge); }
    }
    const fetched = await fetchChallengeServiceFiles(sourceDir, challenge);
    assertChallengeArtifacts(sourceDir, challenge);
    console.log(`[ctf-racer] service files fetched: ${fetched.length}`);
  } else {
    assertChallengeServiceFiles(sourceDir, challenge);
    assertChallengeArtifacts(sourceDir, challenge);
    if (command === "service-check") console.log("[ctf-racer] service files and player artifacts: ok");
    else {
      const handle = await startChallengeService(sourceDir, challenge);
      try { console.log(`[ctf-racer] service smoke: healthy localhost:${challenge.service.local_port}`); }
      finally { await stopChallengeService(handle); console.log("[ctf-racer] service smoke: stopped"); }
    }
  }
  process.exit(0);
}

if (command === "benchmark-import") {
  const sourceIndex = restArgs.indexOf("--source");
  if (sourceIndex === -1 || !restArgs[sourceIndex + 1]) {
    throw new Error("benchmark-import requires --source <artifact>");
  }
  const challenge = loadChallenge(sourceDir);
  const imported = importSingleArtifact(sourceDir, challenge, path.resolve(process.cwd(), restArgs[sourceIndex + 1]));
  console.log("[ctf-racer] imported: " + imported.destination);
  console.log("[ctf-racer] size: " + imported.size);
  console.log("[ctf-racer] sha256: " + imported.sha256);
  process.exit(0);
}

if (command === "inspect") {
  inspectRun(sourceDir);
  process.exit(0);
}

if (command === "benchmark") {
  const runs = parseBenchmarkRuns(restArgs);
  const { report, outputPath } = runBenchmark({ projectRoot, sourceDir, runs });
  console.log("\n[ctf-racer] benchmark summary");
  console.log("[ctf-racer] verified solves: " + report.summary.verified_solves + "/" + report.summary.total_runs);
  console.log("[ctf-racer] verified solve rate: " + (report.summary.verified_solve_rate * 100).toFixed(1) + "%");
  console.log("[ctf-racer] median verified TTF: " + (report.summary.median_verified_ttf_ms === null ? "n/a" : seconds(report.summary.median_verified_ttf_ms) + "s"));
  console.log("[ctf-racer] median all-run time: " + (report.summary.median_all_elapsed_ms === null ? "n/a" : seconds(report.summary.median_all_elapsed_ms) + "s"));
  console.log("[ctf-racer] mean rounds: " + (report.summary.mean_rounds ?? "n/a"));
  console.log("[ctf-racer] stalls: " + report.summary.total_stalls);
  console.log("[ctf-racer] rejected candidates: " + report.summary.total_rejected_candidates);
  console.log("[ctf-racer] report: " + outputPath);
  process.exit(0);
}

if (command === "benchmark-inspect") {
  const inspected = inspectLatestBenchmark({ projectRoot, sourceDir });
  console.log("[ctf-racer] benchmark report: " + inspected.reportPath);
  for (const run of inspected.runs) {
    console.log("\n=== RUN " + run.run + " ===");
    console.log("status=" + run.status +
      " elapsed=" + (run.elapsed_ms === null ? "n/a" : seconds(run.elapsed_ms) + "s") +
      " rounds=" + run.rounds +
      " stalls=" + run.stall_count +
      " rejected=" + run.rejected_candidates.length +
      " skill_proof=" + run.skill_proof_verified);
    for (const diag of run.diagnostics) {
      const signal = diag.progress_marker
        ? "progress=" + diag.progress_marker
        : diag.stalled_marker
          ? "stalled=" + diag.stalled_marker
          : "no-marker";
      console.log("r" + diag.round +
        " stalled=" + diag.stalled +
        " similarity=" + diag.max_response_similarity +
        " " + signal +
        (diag.rejected_flag_candidate ? " rejected_flag=" + diag.rejected_flag_candidate : ""));
    }
    console.log("-- progress summary --");
    if (run.progress_summary.length === 0) console.log("(none)");
    else for (const line of run.progress_summary) console.log(line);
  }
  process.exit(0);
}

const challenge = loadChallenge(sourceDir);
assertChallengeArtifacts(sourceDir, challenge);
assertChallengeServiceFiles(sourceDir, challenge);
const policy = loadPolicy(projectRoot);
if (!policy.authorized_ctf_only) throw new Error("V1 requires authorized_ctf_only=true");

await withChallengeService(sourceDir, challenge, async (service) => {
const effectiveChallenge = service?.flag_sha256 ? { ...challenge, flag_sha256: service.flag_sha256 } : challenge;
const effectivePolicy = policyForChallenge(policy, challenge, service);
const state = prepareWorkspace(projectRoot, sourceDir, challenge);
const runRoot = path.join(projectRoot, "runs", safeChallengeId(challenge.id));
const preflight = runPreflight(state.workspace, challenge);
state.preflight = {
  finding_count: preflight.findingCount,
  high_count: preflight.highCount,
};

const skillNames = skillNamesForChallenge(challenge);
const installedSkills = skillNames.map((name) => ({
  name,
  ...detectInstalledSkill(name, state.workspace),
}));
state.skill_route = {
  expected_skills: skillNames,
  installed: installedSkills.map((skill) => ({
    name: skill.name,
    local_detected: skill.found,
    local_path: skill.path,
  })),
};
writeState(runRoot, state);

const session = await CodexAgentSession.create(state.workspace, effectivePolicy);

console.log(`[ctf-racer] challenge: ${challenge.title}`);
console.log(`[ctf-racer] workspace: ${state.workspace}`);
console.log(`[ctf-racer] model: ${policy.model ?? "Codex default/profile"}`);
console.log(`[ctf-racer] reasoning: ${policy.model_reasoning_effort ?? "profile/default"}`);
console.log("[ctf-racer] policy: one challenge -> one persistent Codex thread");
console.log(`[ctf-racer] live telemetry: ${effectivePolicy.live_telemetry === false ? "disabled" : "enabled"}`);
console.log(`[ctf-racer] telemetry log: ${path.join(runRoot, "telemetry.log")}`);
console.log(`[ctf-racer] preflight: ${preflight.findingCount} finding(s), ${preflight.highCount} high-confidence`);
console.log(`[ctf-racer] skill route: ${skillNames.map((name) => `$${name}`).join(" + ")}`);
for (const skill of installedSkills) {
  console.log(`[ctf-racer] skill local: $${skill.name} ${skill.found ? skill.path : "(not detected in local documented paths)"}`);
}

const result = await solveChallenge({ challenge: effectiveChallenge, policy: effectivePolicy, state, runRoot, session, skillNames, service });
console.log(`[ctf-racer] rounds: ${result.state.rounds}`);
console.log(`[ctf-racer] elapsed: ${seconds(result.state.elapsed_ms ?? 0)}s`);

if (skillNames.length > 0) {
  const proof = verifySkillProof(state.workspace, skillNames);
  result.state.skill_proof = {
    verified: proof.verified,
    status: proof.status,
    skills: proof.skills,
    reference_status: proof.referenceStatus,
    references: proof.references,
  };
  writeState(runRoot, result.state);
  console.log(`[ctf-racer] skill proof: ${proof.status}`);
  for (const skill of proof.skills) {
    console.log(`[ctf-racer] skill proof item: ${skill.name} ${skill.verified ? skill.path : "(not verified)"}`);
  }
  console.log(`[ctf-racer] focused references: ${proof.referenceStatus} (${proof.references.length})`);
  for (const ref of proof.references) {
    console.log(`[ctf-racer] reference proof item: ${ref.skill} ${ref.verified ? ref.path : "(not verified: " + ref.path + ")"}`);
  }
}

if (result.state.status === "solved") {
  console.log(service?.flag_sha256 ? "\n[ctf-racer] SOLVED (verified dynamic flag)" : `\n[ctf-racer] SOLVED (verified): ${result.state.flag}`);
  process.exitCode = 0;
  return;
}

if (result.state.status === "candidate") {
  console.log(`\n[ctf-racer] CANDIDATE (not independently verified): ${result.state.flag}`);
}

console.log(`\n[ctf-racer] ${result.state.status.toUpperCase()} after ${result.state.rounds} persistent rounds.`);
console.log(`[ctf-racer] inspect: ${runRoot}`);
process.exitCode = result.state.status === "error" ? 1 : 3;

});

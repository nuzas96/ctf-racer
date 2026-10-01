import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadChallenge, safeChallengeId } from "./challenge.js";
import { assertChallengeArtifacts } from "./artifacts.js";
import { loadPolicy } from "./config.js";
import { assertChallengeServiceFiles } from "./service.js";

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function rounded(value, digits = 3) {
  if (value === null || value === undefined) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function summarizeRuns(runs) {
  const verified = runs.filter((run) => run.status === "solved" && run.flag_verified === true);
  const elapsedAll = runs.map((run) => run.elapsed_ms).filter(Number.isFinite);
  const elapsedVerified = verified.map((run) => run.elapsed_ms).filter(Number.isFinite);
  const roundValues = runs.map((run) => run.rounds).filter(Number.isFinite);

  const counts = {};
  for (const run of runs) {
    counts[run.status] = (counts[run.status] ?? 0) + 1;
  }

  return {
    total_runs: runs.length,
    verified_solves: verified.length,
    verified_solve_rate: runs.length ? rounded(verified.length / runs.length, 4) : 0,
    status_counts: counts,
    median_verified_ttf_ms: median(elapsedVerified),
    median_all_elapsed_ms: median(elapsedAll),
    mean_rounds: roundValues.length
      ? rounded(roundValues.reduce((a, b) => a + b, 0) / roundValues.length, 3)
      : null,
    total_stalls: runs.reduce((sum, run) => sum + (run.stall_count ?? 0), 0),
    total_rejected_candidates: runs.reduce((sum, run) => sum + (run.rejected_candidates ?? 0), 0),
  };
}

function compactRun(index, state, exitCode) {
  return {
    run: index,
    status: state.status ?? "unknown",
    flag_verified: state.flag_verified === true,
    elapsed_ms: state.elapsed_ms ?? null,
    rounds: state.rounds ?? 0,
    stall_count: state.stall_count ?? 0,
    rejected_candidates: state.rejected_candidates?.length ?? 0,
    skill_proof_verified: state.skill_proof?.verified === true,
    focused_reference_status: state.skill_proof?.reference_status ?? "unknown",
    focused_reference_count: state.skill_proof?.references?.length ?? 0,
    exit_code: exitCode,
  };
}

export function runBenchmark({ projectRoot, sourceDir, runs = 5 }) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 50) {
    throw new Error("benchmark runs must be an integer from 1 to 50");
  }

  const challenge = loadChallenge(sourceDir);
  assertChallengeArtifacts(sourceDir, challenge);
  assertChallengeServiceFiles(sourceDir, challenge);
  if (!challenge.flag_sha256 && !challenge.service?.dynamic_flag_env && !challenge.service?.dynamic_flag_file) {
    throw new Error("repeatable benchmark requires challenge.flag_sha256");
  }

  const challengeId = safeChallengeId(challenge.id);
  const results = [];
  const cliPath = path.join(projectRoot, "src", "cli.js");

  for (let index = 1; index <= runs; index++) {
    console.log("\n[ctf-racer] benchmark run " + index + "/" + runs);
    const child = spawnSync(
      process.execPath,
      [cliPath, "solve", sourceDir],
      {
        cwd: projectRoot,
        env: process.env,
        stdio: "inherit",
      }
    );

    const statePath = path.join(projectRoot, "runs", challengeId, "state.json");
    if (!fs.existsSync(statePath)) {
      throw new Error("benchmark child produced no state file: " + statePath);
    }

    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    results.push(compactRun(index, state, child.status ?? 1));
  }

  const summary = summarizeRuns(results);
  const policy = loadPolicy(projectRoot);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(projectRoot, "runs", "_benchmarks", challengeId);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, stamp + ".json");

  const report = {
    challenge_id: challenge.id,
    challenge_title: challenge.title,
    created_at: new Date().toISOString(),
    requested_runs: runs,
    model: policy.model,
    reasoning: policy.model_reasoning_effort,
    summary,
    runs: results,
  };

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");
  return { report, outputPath };
}


function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function latestJsonFile(dir) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter((name) => name.endsWith(".json"))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

function progressSummary(runRoot) {
  const progressPath = path.join(runRoot, "workspace", "PROGRESS.md");
  const legacyPath = path.join(runRoot, "workspace", "FINDINGS.md");
  const file = fs.existsSync(progressPath) ? progressPath : legacyPath;
  if (!fs.existsSync(file)) return [];

  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("## ") || line.startsWith("- "))
    .slice(-24);
}

function runSnapshots(projectRoot, challengeId) {
  const snapshots = [];
  const currentRoot = path.join(projectRoot, "runs", challengeId);
  const currentState = path.join(currentRoot, "state.json");
  if (fs.existsSync(currentState)) {
    snapshots.push({ root: currentRoot, state: readJson(currentState) });
  }

  const historyRoot = path.join(projectRoot, "runs", "_history", challengeId);
  if (fs.existsSync(historyRoot)) {
    for (const name of fs.readdirSync(historyRoot).sort()) {
      const root = path.join(historyRoot, name);
      const statePath = path.join(root, "state.json");
      if (fs.existsSync(statePath)) {
        snapshots.push({ root, state: readJson(statePath) });
      }
    }
  }

  return snapshots;
}

export function inspectLatestBenchmark({ projectRoot, sourceDir }) {
  const challenge = loadChallenge(sourceDir);
  const challengeId = safeChallengeId(challenge.id);
  const reportDir = path.join(projectRoot, "runs", "_benchmarks", challengeId);
  const reportPath = latestJsonFile(reportDir);
  if (!reportPath) {
    throw new Error("no benchmark report found for " + challenge.id);
  }

  const report = readJson(reportPath);
  const reportTime = Date.parse(report.created_at);
  const candidates = runSnapshots(projectRoot, challengeId)
    .filter(({ state }) => {
      const finished = Date.parse(state.finished_at ?? state.updated_at ?? "");
      return Number.isFinite(finished) && finished <= reportTime + 5000;
    })
    .sort((a, b) => {
      const left = Date.parse(a.state.finished_at ?? a.state.updated_at ?? "");
      const right = Date.parse(b.state.finished_at ?? b.state.updated_at ?? "");
      return left - right;
    });

  const selected = candidates.slice(-report.requested_runs);
  if (selected.length !== report.requested_runs) {
    throw new Error(
      "expected " + report.requested_runs + " run snapshots but found " + selected.length
    );
  }

  const runs = selected.map(({ root, state }, index) => ({
    run: index + 1,
    root,
    status: state.status,
    elapsed_ms: state.elapsed_ms ?? null,
    rounds: state.rounds ?? 0,
    stall_count: state.stall_count ?? 0,
    rejected_candidates: state.rejected_candidates ?? [],
    skill_proof_verified: state.skill_proof?.verified === true,
    diagnostics: (state.round_diagnostics ?? []).map((item) => ({
      round: item.round,
      stalled: item.stalled,
      progress_marker: item.progress_marker ?? null,
      stalled_marker: item.stalled_marker ?? null,
      rejected_flag_candidate: item.rejected_flag_candidate ?? null,
      max_response_similarity: item.max_response_similarity ?? null,
    })),
    progress_summary: progressSummary(root),
  }));

  return { reportPath, report, runs };
}

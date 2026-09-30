import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { loadChallenge, safeChallengeId } from "./challenge.js";
import { loadPolicy } from "./config.js";

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
    exit_code: exitCode,
  };
}

export function runBenchmark({ projectRoot, sourceDir, runs = 5 }) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 50) {
    throw new Error("benchmark runs must be an integer from 1 to 50");
  }

  const challenge = loadChallenge(sourceDir);
  if (!challenge.flag_sha256) {
    throw new Error("repeatable benchmark requires challenge.flag_sha256");
  }

  const challengeId = safeChallengeId(challenge.id);
  const results = [];
  const cliPath = path.join(projectRoot, "src", "cli.js");

  for (let index = 1; index <= runs; index++) {
    console.log("\\n[ctf-racer] benchmark run " + index + "/" + runs);
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

  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\\n");
  return { report, outputPath };
}

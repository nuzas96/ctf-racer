import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBenchmark, summarizeRuns } from "../src/benchmark.js";

function makeBenchmarkFixture(t, childScript) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-benchmark-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const sourceDir = path.join(root, "challenge");
  fs.mkdirSync(path.join(sourceDir, "files"), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "challenge.json"), JSON.stringify({
    id: "benchmark-freshness",
    title: "Benign benchmark fixture",
    description: "Deterministic child process; no solver is launched.",
    flag_sha256: "0".repeat(64),
  }));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "cli.js"), childScript);
  return { root, sourceDir, statePath: path.join(root, "runs", "benchmark-freshness", "state.json") };
}

test("benchmark summary counts only independently verified solves", () => {
  const summary = summarizeRuns([
    { status: "solved", flag_verified: true, elapsed_ms: 400000, rounds: 2, stall_count: 0, rejected_candidates: 0 },
    { status: "candidate", flag_verified: false, elapsed_ms: 300000, rounds: 1, stall_count: 0, rejected_candidates: 0 },
    { status: "unsolved", flag_verified: false, elapsed_ms: 500000, rounds: 4, stall_count: 1, rejected_candidates: 1 },
    { status: "solved", flag_verified: true, elapsed_ms: 200000, rounds: 1, stall_count: 0, rejected_candidates: 0 },
  ]);

  assert.equal(summary.total_runs, 4);
  assert.equal(summary.verified_solves, 2);
  assert.equal(summary.verified_solve_rate, 0.5);
  assert.equal(summary.median_verified_ttf_ms, 300000);
  assert.equal(summary.median_all_elapsed_ms, 350000);
  assert.equal(summary.mean_rounds, 2);
  assert.equal(summary.total_stalls, 1);
  assert.equal(summary.total_rejected_candidates, 1);
  assert.deepEqual(summary.status_counts, {
    solved: 2,
    candidate: 1,
    unsolved: 1,
  });
});

test("benchmark attributes a fresh interrupted child state to its attempt", (t) => {
  const fixture = makeBenchmarkFixture(t, `
    import fs from "node:fs";
    import path from "node:path";
    const statePath = path.join(process.cwd(), "runs", "benchmark-freshness", "state.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify({
      status: "environment_interrupted",
      flag_verified: false,
      rounds: 2,
      attempt_id: process.env.CTF_RACER_BENCHMARK_ATTEMPT_ID,
      runtime_metadata: {
        attempt_id: process.env.CTF_RACER_BENCHMARK_ATTEMPT_ID,
        configuration: { model: "fixture-model", reasoning_effort: "low" },
      },
      benchmark_attempt_id: process.env.CTF_RACER_BENCHMARK_ATTEMPT_ID,
    }));
    process.exit(130);
  `);

  const { report } = runBenchmark({ projectRoot: fixture.root, sourceDir: fixture.sourceDir, runs: 1 });
  assert.equal(report.runs[0].status, "environment_interrupted");
  assert.equal(report.runs[0].exit_code, 130);
  const state = JSON.parse(fs.readFileSync(fixture.statePath, "utf8"));
  assert.match(state.benchmark_attempt_id, /^[0-9a-f-]{36}$/);
  assert.equal(state.runtime_metadata.attempt_id, state.attempt_id);
  assert.equal(report.model, "fixture-model");
  assert.equal(report.reasoning, "low");
});

test("benchmark rejects a prior verified state when the child fails before writing attempt state", (t) => {
  const fixture = makeBenchmarkFixture(t, "process.exit(23);\n");
  fs.mkdirSync(path.dirname(fixture.statePath), { recursive: true });
  const priorState = JSON.stringify({
    status: "solved",
    flag_verified: true,
    elapsed_ms: 17,
    rounds: 1,
  });
  fs.writeFileSync(fixture.statePath, priorState);

  assert.throws(
    () => runBenchmark({ projectRoot: fixture.root, sourceDir: fixture.sourceDir, runs: 1 }),
    /benchmark child produced no state for attempt 1/
  );
  assert.equal(fs.readFileSync(fixture.statePath, "utf8"), priorState);
  assert.equal(fs.existsSync(path.join(fixture.root, "runs", "_benchmarks", "benchmark-freshness")), false);
});

test("benchmark rejects runtime metadata with a mismatched attempt identity", (t) => {
  const fixture = makeBenchmarkFixture(t, `
    import fs from "node:fs";
    import path from "node:path";
    const statePath = path.join(process.cwd(), "runs", "benchmark-freshness", "state.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const current = process.env.CTF_RACER_BENCHMARK_ATTEMPT_ID;
    fs.writeFileSync(statePath, JSON.stringify({
      status: "unsolved",
      attempt_id: current,
      benchmark_attempt_id: current,
      runtime_metadata: { attempt_id: "00000000-0000-4000-8000-000000000000" },
    }));
  `);

  assert.throws(
    () => runBenchmark({ projectRoot: fixture.root, sourceDir: fixture.sourceDir, runs: 1 }),
    /benchmark child produced no state for attempt 1/
  );
});

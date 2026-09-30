import test from "node:test";
import assert from "node:assert/strict";
import { summarizeRuns } from "../src/benchmark.js";

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

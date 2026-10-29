import test from "node:test";
import assert from "node:assert/strict";
import { continuationRoundsForRun } from "../src/config.js";

test("per-run round cap can lower but never raise the configured limit", () => {
  const policy = { max_continuation_rounds: 4 };
  assert.equal(continuationRoundsForRun(policy, undefined), 4);
  assert.equal(continuationRoundsForRun(policy, 2), 2);
  assert.equal(continuationRoundsForRun(policy, 9), 4);
});

test("per-run round cap rejects non-positive and malformed policy values", () => {
  assert.throws(() => continuationRoundsForRun({ max_continuation_rounds: 0 }, 2), /policy/);
  assert.throws(() => continuationRoundsForRun({ max_continuation_rounds: 4 }, 0), /positive integer/);
});

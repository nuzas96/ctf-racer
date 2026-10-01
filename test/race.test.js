import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runChallengeWithRetry, runConcurrent, runRace } from "../src/race.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("concurrent scheduler respects its challenge limit", async () => {
  let active = 0;
  let maxActive = 0;
  const values = await runConcurrent([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await sleep(10);
    active -= 1;
    return value * 10;
  });

  assert.deepEqual(values, [10, 20, 30, 40, 50]);
  assert.equal(maxActive, 2);
});

test("fresh retry starts only after primary failure and stops on verified solve", async () => {
  const seen = [];
  const result = await runChallengeWithRetry({
    entry: { challenge_id: "crypto-1", path: "benchmarks/crypto-1", category: "crypto" },
    freshRetries: 2,
    executeAttempt: async (_entry, attempt) => {
      seen.push(attempt);
      if (attempt === 1) return { attempt, status: "unsolved", flag_verified: false };
      return { attempt, status: "solved", flag_verified: true };
    },
  });

  assert.deepEqual(seen, [1, 2]);
  assert.equal(result.verified, true);
  assert.equal(result.winning_attempt, 2);
  assert.equal(result.attempts.length, 2);
});

test("race mode runs distinct challenges concurrently and records retries separately", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-race-"));
  fs.mkdirSync(path.join(root, "benchmarks"), { recursive: true });

  for (const id of ["alpha", "beta", "gamma"]) {
    const dir = path.join(root, "benchmarks", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "challenge.json"),
      JSON.stringify({
        id,
        title: id,
        description: "test",
        category: id === "alpha" ? "crypto" : "misc",
        flag_sha256: "0".repeat(64),
      }),
    );
  }

  const suitePath = path.join(root, "benchmarks", "race.json");
  fs.writeFileSync(
    suitePath,
    JSON.stringify({
      id: "race-test",
      benchmarks: [
        { path: "benchmarks/alpha", category: "crypto", required: true },
        { path: "benchmarks/beta", category: "misc", required: true },
        { path: "benchmarks/gamma", category: "misc", required: true },
      ],
    }),
  );

  const attempts = new Map();
  let active = 0;
  let maxActive = 0;

  const result = await runRace({
    projectRoot: root,
    suitePath,
    concurrency: 2,
    freshRetries: 1,
    executeAttempt: async (entry, attempt) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await sleep(8);
      active -= 1;
      attempts.set(entry.challenge_id, (attempts.get(entry.challenge_id) ?? 0) + 1);

      if (entry.challenge_id === "alpha" && attempt === 1) {
        return { attempt, status: "unsolved", flag_verified: false, elapsed_ms: 8 };
      }
      return { attempt, status: "solved", flag_verified: true, elapsed_ms: 8 };
    },
  });

  assert.equal(maxActive, 2);
  assert.equal(result.verified_challenges, 3);
  assert.equal(result.total_challenges, 3);
  assert.equal(result.total_attempts, 4);
  assert.equal(attempts.get("alpha"), 2);
  assert.equal(attempts.get("beta"), 1);
  assert.equal(attempts.get("gamma"), 1);
  assert.equal(fs.existsSync(result.output_path), true);
  const alpha = result.challenges.find((item) => item.challenge_id === "alpha");
  assert.equal(alpha.winning_attempt, 2);
});

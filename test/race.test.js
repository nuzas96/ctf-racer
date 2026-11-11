import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { safeChallengeId } from "../src/challenge.js";
import { runChallengeWithRetry, runConcurrent, runRace, spawnSolve } from "../src/race.js";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function makeSpawnFixture(t, challengeId, cliSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-spawn-attempt-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "cli.js"), cliSource);
  return {
    root,
    challengeId,
    sourceDir: path.join(root, "fixture-challenge"),
    statePath: path.join(root, "runs", challengeId, "state.json"),
  };
}

function makeRaceSuiteFixture(t, challengeIds) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-race-collision-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const benchmarks = path.join(root, "benchmarks");
  fs.mkdirSync(benchmarks, { recursive: true });
  const entries = challengeIds.map((id, index) => {
    const relativePath = path.join("benchmarks", `fixture-${index}`);
    const sourceDir = path.join(root, relativePath);
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "challenge.json"), JSON.stringify({
      id,
      title: `Fixture ${index}`,
      description: "Benign race preflight fixture",
      category: "misc",
    }));
    return { path: relativePath, category: "misc", required: true };
  });
  const suitePath = path.join(benchmarks, "suite.json");
  fs.writeFileSync(path.join(benchmarks, "suite.json"), JSON.stringify({ id: "collision-fixture", benchmarks: entries }));

  const runDirectory = path.join(root, "runs", safeChallengeId(challengeIds[0]));
  const markerPath = path.join(runDirectory, "workspace", "solve", "preserve-me.txt");
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, "existing workspace must remain byte-identical\n");
  const statePath = path.join(runDirectory, "state.json");
  fs.writeFileSync(statePath, '{"fixture_state":"preserve-me"}\n');

  return { root, suitePath, runDirectory, markerPath, statePath };
}

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

test("race attempt records preserve runtime fingerprints and unique identity", async (t) => {
  const challengeId = "runtime-fingerprint-fixture";
  const fixture = makeSpawnFixture(t, challengeId, `
    import fs from "node:fs";
    import path from "node:path";
    const file = path.join(process.cwd(), "runs", "${challengeId}", "state.json");
    const attemptId = process.env.CTF_RACER_ATTEMPT_ID;
    const metadata = { attempt_id: attemptId, runtime: { node_version: "v24.fixture" } };
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      status: "unsolved",
      attempt_id: attemptId,
      runtime_metadata: metadata,
    }));
  `);

  const result = await spawnSolve({
    projectRoot: fixture.root,
    sourceDir: fixture.sourceDir,
    challenge: { id: challengeId },
    attempt: 1,
  });
  assert.match(result.attempt_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(result.runtime_metadata.attempt_id, result.attempt_id);
  assert.equal(result.status, "unsolved");
});

test("race rejects a previous verified state when a child fails before writing", async (t) => {
  const challengeId = "stale-state-fixture";
  const fixture = makeSpawnFixture(t, challengeId, "process.exit(23);\n");
  fs.mkdirSync(path.dirname(fixture.statePath), { recursive: true });
  fs.writeFileSync(fixture.statePath, JSON.stringify({
    started_at: new Date().toISOString(),
    attempt_id: "00000000-0000-4000-8000-000000000001",
    status: "solved",
    flag_verified: true,
    runtime_metadata: { attempt_id: "00000000-0000-4000-8000-000000000001" },
  }));

  const result = await spawnSolve({ projectRoot: fixture.root, sourceDir: fixture.sourceDir, challenge: { id: challengeId }, attempt: 2 });
  assert.equal(result.exit_code, 23);
  assert.equal(result.status, "error");
  assert.equal(result.flag_verified, false);
  assert.notEqual(result.attempt_id, "00000000-0000-4000-8000-000000000001");
  assert.match(result.error, /attempt ID mismatch/);
  assert.equal(JSON.parse(fs.readFileSync(fixture.statePath, "utf8")).flag_verified, true);
});

test("race rejects state with a missing attempt UUID", async (t) => {
  const challengeId = "missing-state-id-fixture";
  const fixture = makeSpawnFixture(t, challengeId, `
    import fs from "node:fs";
    import path from "node:path";
    const file = path.join(process.cwd(), "runs", "${challengeId}", "state.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      status: "solved", flag_verified: true,
      runtime_metadata: { attempt_id: process.env.CTF_RACER_ATTEMPT_ID },
    }));
  `);

  const result = await spawnSolve({ projectRoot: fixture.root, sourceDir: fixture.sourceDir, challenge: { id: challengeId }, attempt: 1 });
  assert.equal(result.status, "error");
  assert.equal(result.flag_verified, false);
  assert.match(result.error, /attempt ID mismatch/);
});

test("race rejects state with a mismatched attempt UUID", async (t) => {
  const challengeId = "mismatched-state-id-fixture";
  const fixture = makeSpawnFixture(t, challengeId, `
    import fs from "node:fs";
    import path from "node:path";
    const file = path.join(process.cwd(), "runs", "${challengeId}", "state.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      attempt_id: "00000000-0000-4000-8000-000000000099",
      status: "solved", flag_verified: true,
      runtime_metadata: { attempt_id: "00000000-0000-4000-8000-000000000099" },
    }));
  `);

  const result = await spawnSolve({ projectRoot: fixture.root, sourceDir: fixture.sourceDir, challenge: { id: challengeId }, attempt: 1 });
  assert.equal(result.status, "error");
  assert.equal(result.flag_verified, false);
  assert.match(result.error, /attempt ID mismatch/);
});

test("race accepts a verified state with the exact attempt UUID", async (t) => {
  const challengeId = "verified-state-id-fixture";
  const fixture = makeSpawnFixture(t, challengeId, `
    import fs from "node:fs";
    import path from "node:path";
    const attemptId = process.env.CTF_RACER_ATTEMPT_ID;
    const file = path.join(process.cwd(), "runs", "${challengeId}", "state.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      attempt_id: attemptId, status: "solved", flag_verified: true,
      runtime_metadata: { attempt_id: attemptId },
    }));
  `);

  const result = await spawnSolve({ projectRoot: fixture.root, sourceDir: fixture.sourceDir, challenge: { id: challengeId }, attempt: 1 });
  assert.equal(result.status, "solved");
  assert.equal(result.flag_verified, true);
  assert.equal(result.runtime_metadata.attempt_id, result.attempt_id);
});

test("race preserves an interrupted state with the exact attempt UUID", async (t) => {
  const challengeId = "interrupted-state-id-fixture";
  const fixture = makeSpawnFixture(t, challengeId, `
    import fs from "node:fs";
    import path from "node:path";
    const attemptId = process.env.CTF_RACER_ATTEMPT_ID;
    const file = path.join(process.cwd(), "runs", "${challengeId}", "state.json");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({
      attempt_id: attemptId, status: "environment_interrupted", flag_verified: false,
      terminal_reason: "interrupted", runtime_metadata: { attempt_id: attemptId },
    }));
    process.exit(130);
  `);

  const result = await spawnSolve({ projectRoot: fixture.root, sourceDir: fixture.sourceDir, challenge: { id: challengeId }, attempt: 1 });
  assert.equal(result.status, "environment_interrupted");
  assert.equal(result.flag_verified, false);
  assert.equal(result.terminal_reason, "interrupted");
  assert.equal(result.exit_code, 130);
  assert.equal(result.runtime_metadata.attempt_id, result.attempt_id);
});

test("concurrent race children cannot exchange state attribution", async (t) => {
  const challengeId = "concurrent-state-id-fixture";
  const fixture = makeSpawnFixture(t, challengeId, `
    import fs from "node:fs";
    import path from "node:path";
    const id = process.env.CTF_RACER_ATTEMPT_ID;
    const barrier = process.env.CTF_RACER_RACE_TEST_BARRIER;
    const state = path.join(process.cwd(), "runs", "${challengeId}", "state.json");
    fs.mkdirSync(path.dirname(state), { recursive: true });
    fs.writeFileSync(path.join(barrier, "ready-" + id), "ready");
    const waitFor = (predicate) => {
      const deadline = Date.now() + 5000;
      while (!predicate()) {
        if (Date.now() > deadline) process.exit(91);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
      }
    };
    waitFor(() => fs.readdirSync(barrier).filter((name) => name.startsWith("ready-")).length === 2);
    const ids = fs.readdirSync(barrier).filter((name) => name.startsWith("ready-")).map((name) => name.slice(6)).sort();
    const firstDone = path.join(barrier, "first-done");
    const secondDone = path.join(barrier, "second-done");
    if (id === ids[0]) {
      fs.writeFileSync(state, JSON.stringify({ attempt_id: id, status: "solved", flag_verified: true, runtime_metadata: { attempt_id: id } }));
      fs.writeFileSync(firstDone, "done");
      waitFor(() => fs.existsSync(secondDone));
    } else {
      waitFor(() => fs.existsSync(firstDone));
      fs.writeFileSync(state, JSON.stringify({ attempt_id: id, status: "environment_interrupted", flag_verified: false, runtime_metadata: { attempt_id: id } }));
      fs.writeFileSync(secondDone, "done");
    }
  `);
  const barrier = path.join(fixture.root, "barrier");
  fs.mkdirSync(barrier);
  const previousBarrier = process.env.CTF_RACER_RACE_TEST_BARRIER;
  process.env.CTF_RACER_RACE_TEST_BARRIER = barrier;
  let results;
  try {
    results = await Promise.all([1, 2].map((attempt) => spawnSolve({
      projectRoot: fixture.root,
      sourceDir: fixture.sourceDir,
      challenge: { id: challengeId },
      attempt,
    })));
  } finally {
    if (previousBarrier === undefined) delete process.env.CTF_RACER_RACE_TEST_BARRIER;
    else process.env.CTF_RACER_RACE_TEST_BARRIER = previousBarrier;
  }
  assert.notEqual(results[0].attempt_id, results[1].attempt_id);
  assert.deepEqual(results.map((result) => result.status).sort(), ["environment_interrupted", "error"]);
  const rejected = results.find((result) => result.status === "error");
  const accepted = results.find((result) => result.status === "environment_interrupted");
  assert.equal(rejected.flag_verified, false);
  assert.match(rejected.error, /attempt ID mismatch/);
  assert.equal(accepted.flag_verified, false);
  assert.equal(accepted.runtime_metadata.attempt_id, accepted.attempt_id);
});

test("race preflight rejects colliding run directories before child launch or workspace changes", async (t) => {
  const cases = [
    { label: "duplicate challenge IDs", ids: ["same-challenge", "same-challenge"], runId: "same-challenge" },
    { label: "slash normalization collision", ids: ["shared/one", "shared-one"], runId: "shared-one" },
    { label: "punctuation normalization collision", ids: ["alpha@@beta", "alpha--beta"], runId: "alpha-beta" },
  ];

  for (const { label, ids, runId } of cases) {
    await t.test(label, async (subtest) => {
      const fixture = makeRaceSuiteFixture(subtest, ids);
      assert.equal(safeChallengeId(ids[0]), runId);
      assert.equal(safeChallengeId(ids[1]), runId);
      const beforeState = fs.readFileSync(fixture.statePath);
      const beforeWorkspace = fs.readFileSync(fixture.markerPath);
      const beforeRunEntries = fs.readdirSync(fixture.runDirectory).sort();
      let childLaunches = 0;
      const expectedError = `race suite has run-directory collision: challenge IDs ${JSON.stringify(ids[0])} ("benchmarks/fixture-0") and ${JSON.stringify(ids[1])} ("benchmarks/fixture-1") both resolve to runs/${runId}`;

      await assert.rejects(runRace({
        projectRoot: fixture.root,
        suitePath: fixture.suitePath,
        concurrency: 2,
        freshRetries: 0,
        executeAttempt: async () => {
          childLaunches += 1;
          return { status: "solved", flag_verified: true };
        },
      }), { message: expectedError });

      assert.equal(childLaunches, 0);
      assert.deepEqual(fs.readdirSync(fixture.runDirectory).sort(), beforeRunEntries);
      assert.deepEqual(fs.readFileSync(fixture.statePath), beforeState);
      assert.deepEqual(fs.readFileSync(fixture.markerPath), beforeWorkspace);
      assert.equal(fs.existsSync(path.join(fixture.root, "runs", "_history")), false);
    });
  }
});

test("race mode runs distinct challenges concurrently and records retries separately", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-race-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
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

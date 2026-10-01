import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { discoverIntakeChallenges, raceStatus, writeIntakeSuite } from "../src/intake.js";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-intake-"));
}

function writeChallenge(dir, { id, category = "misc" }) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, "challenge.json"),
    JSON.stringify({
      id,
      title: id,
      description: "intake test",
      category,
      flag_sha256: "0".repeat(64),
    }),
  );
}

test("intake discovers nested challenge directories and writes a race manifest", () => {
  const root = tmp();
  const intake = path.join(root, "incoming");
  writeChallenge(path.join(intake, "crypto", "one"), { id: "one", category: "crypto" });
  writeChallenge(path.join(intake, "web", "two"), { id: "two", category: "web" });

  const discovered = discoverIntakeChallenges(intake);
  assert.equal(discovered.entries.length, 2);
  assert.deepEqual(discovered.entries.map((x) => x.challenge_id), ["one", "two"]);

  const generated = writeIntakeSuite(root, intake, discovered);
  assert.equal(fs.existsSync(generated.outputPath), true);
  const suite = JSON.parse(fs.readFileSync(generated.outputPath, "utf8"));
  assert.equal(suite.benchmarks.length, 2);
  assert.equal(suite.benchmarks[0].required, true);
});

test("intake rejects duplicate challenge ids before model calls", () => {
  const root = tmp();
  const intake = path.join(root, "incoming");
  writeChallenge(path.join(intake, "a"), { id: "duplicate" });
  writeChallenge(path.join(intake, "b"), { id: "duplicate" });
  assert.throws(() => discoverIntakeChallenges(intake), /duplicate challenge id/);
});

test("race status is zero-token and summarizes current state plus last telemetry", () => {
  const root = tmp();
  const challengeDir = path.join(root, "incoming", "one");
  writeChallenge(challengeDir, { id: "one", category: "crypto" });

  const manifest = path.join(root, "manifest.json");
  fs.writeFileSync(
    manifest,
    JSON.stringify({
      id: "status-test",
      benchmarks: [{ path: challengeDir, category: "crypto", required: true }],
    }),
  );

  const runRoot = path.join(root, "runs", "one");
  fs.mkdirSync(runRoot, { recursive: true });
  fs.writeFileSync(
    path.join(runRoot, "state.json"),
    JSON.stringify({ status: "running", rounds: 2, stall_count: 1, elapsed_ms: 1234 }),
  );
  fs.writeFileSync(
    path.join(runRoot, "telemetry.log"),
    "[live] first\n[live] latest progress\n",
  );

  const status = raceStatus(root, manifest);
  assert.equal(status.challenges.length, 1);
  assert.equal(status.challenges[0].status, "running");
  assert.equal(status.challenges[0].rounds, 2);
  assert.equal(status.challenges[0].last_telemetry, "[live] latest progress");
});

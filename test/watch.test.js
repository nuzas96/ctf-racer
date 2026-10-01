import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { readWatchStatus, runWatch, scanWatchRoot, watchStatePath } from "../src/watch.js";

function tmp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-watch-"));
}

function writeChallenge(dir, { id, category = "misc", artifact = false }) {
  fs.mkdirSync(dir, { recursive: true });
  const challenge = {
    id,
    title: id,
    description: "watch test",
    category,
    flag_sha256: "0".repeat(64),
  };

  if (artifact) {
    const data = Buffer.from("ready-artifact\n");
    challenge.artifact_manifest = [{
      path: "artifact.bin",
      size: data.length,
      sha256: crypto.createHash("sha256").update(data).digest("hex"),
    }];
  }

  fs.writeFileSync(path.join(dir, "challenge.json"), JSON.stringify(challenge));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("watch scan keeps incomplete challenge waiting until artifacts are ready", () => {
  const root = tmp();
  const incoming = path.join(root, "incoming");
  const challengeDir = path.join(incoming, "crypto", "one");
  writeChallenge(challengeDir, { id: "one", category: "crypto", artifact: true });

  let scan = scanWatchRoot(incoming);
  assert.equal(scan.entries.length, 1);
  assert.equal(scan.entries[0].ready, false);
  assert.match(scan.entries[0].waiting_reason, /artifact verification failed/);

  const data = Buffer.from("ready-artifact\n");
  fs.mkdirSync(path.join(challengeDir, "files"), { recursive: true });
  fs.writeFileSync(path.join(challengeDir, "files", "artifact.bin"), data);

  scan = scanWatchRoot(incoming);
  assert.equal(scan.entries[0].ready, true);
  assert.equal(scan.entries[0].waiting_reason, null);
});

test("watch dispatches ready challenges with bounded concurrency", async () => {
  const root = tmp();
  const incoming = path.join(root, "incoming");
  for (const id of ["one", "two", "three", "four"]) {
    writeChallenge(path.join(incoming, id), { id });
  }

  let active = 0;
  let maxActive = 0;
  const seen = [];

  const status = await runWatch({
    projectRoot: root,
    intakeRoot: incoming,
    concurrency: 2,
    freshRetries: 0,
    pollMs: 100,
    idleExitMs: 220,
    executeAttempt: async (entry, attempt) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      seen.push(entry.challenge_id);
      await sleep(35);
      active -= 1;
      return {
        attempt,
        status: "solved",
        flag_verified: true,
        elapsed_ms: 35,
        rounds: 1,
      };
    },
  });

  assert.equal(maxActive, 2);
  assert.equal(new Set(seen).size, 4);
  assert.equal(status.counts.solved, 4);
  assert.equal(fs.existsSync(watchStatePath(root, incoming)), true);
});

test("watch restart does not relaunch already solved challenges", async () => {
  const root = tmp();
  const incoming = path.join(root, "incoming");
  writeChallenge(path.join(incoming, "one"), { id: "one" });

  let calls = 0;
  const executeAttempt = async (_entry, attempt) => {
    calls += 1;
    return {
      attempt,
      status: "solved",
      flag_verified: true,
      elapsed_ms: 1,
      rounds: 1,
    };
  };

  await runWatch({
    projectRoot: root,
    intakeRoot: incoming,
    concurrency: 1,
    freshRetries: 0,
    pollMs: 100,
    idleExitMs: 120,
    executeAttempt,
  });
  assert.equal(calls, 1);

  await runWatch({
    projectRoot: root,
    intakeRoot: incoming,
    concurrency: 1,
    freshRetries: 0,
    pollMs: 100,
    idleExitMs: 120,
    executeAttempt,
  });
  assert.equal(calls, 1);

  const status = readWatchStatus(root, incoming);
  assert.equal(status.counts.solved, 1);
  assert.equal(status.challenges[0].status, "solved");
});


test("watch auto-creates a missing intake root", async () => {
  const root = tmp();
  const incoming = path.join(root, "does-not-exist-yet");
  assert.equal(fs.existsSync(incoming), false);

  const status = await runWatch({
    projectRoot: root,
    intakeRoot: incoming,
    concurrency: 1,
    freshRetries: 0,
    pollMs: 100,
    idleExitMs: 120,
    executeAttempt: async () => {
      throw new Error("should not execute without challenges");
    },
  });

  assert.equal(fs.existsSync(incoming), true);
  assert.deepEqual(status.counts, {});
});

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { solveChallenge } from "../src/runner.js";

class MockSession {
  constructor(responses) {
    this.responses = [...responses];
  }
  async run() {
    return { finalResponse: this.responses.shift() ?? "no result" };
  }
}

function basePolicy() {
  return {
    max_continuation_rounds: 4,
    max_consecutive_stalls: 2,
    stall_similarity_threshold: 0.82,
    allow_external_web_research: false,
    allow_challenge_network: false,
    auto_submit: false,
  };
}

function baseState(root) {
  fs.mkdirSync(path.join(root, "solve"), { recursive: true });
  fs.writeFileSync(path.join(root, "PROGRESS.md"), "# Progress\n\n");
  return {
    challenge_id: "x",
    status: "prepared",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    workspace: root,
    rounds: 0,
  };
}

test("verified benchmark flag becomes solved", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-test-"));
  const result = await solveChallenge({
    challenge: {
      id: "x",
      title: "x",
      description: "x",
      flag_regex: "FLAG\\{[^}]+\\}",
      flag_sha256: "7ac33e6ce77b9a9616b868900c0e5481bd73a13886231f21102d5a5248f5d478",
    },
    policy: basePolicy(),
    state: baseState(root),
    runRoot: root,
    session: new MockSession(["CTF_RACER_FLAG=FLAG{done}"]),
    skillNames: [],
  });

  assert.equal(result.state.status, "solved");
  assert.equal(result.state.flag_verified, true);
  assert.equal(result.state.flag, "FLAG{done}");
});

test("wrong benchmark flag is rejected and the same session continues", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-test-"));
  const session = new MockSession([
    "CTF_RACER_FLAG=FLAG{wrong}",
    "CTF_RACER_FLAG=FLAG{done}",
  ]);
  const result = await solveChallenge({
    challenge: {
      id: "x",
      title: "x",
      description: "x",
      flag_regex: "FLAG\\{[^}]+\\}",
      flag_sha256: "7ac33e6ce77b9a9616b868900c0e5481bd73a13886231f21102d5a5248f5d478",
    },
    policy: basePolicy(),
    state: baseState(root),
    runRoot: root,
    session,
    skillNames: [],
  });

  assert.equal(result.state.status, "solved");
  assert.equal(result.state.rounds, 2);
  assert.equal(result.state.flag, "FLAG{done}");
  assert.equal(result.state.flag_verified, true);
  assert.deepEqual(result.state.rejected_candidates, [
    { round: 1, candidate: "FLAG{wrong}" },
  ]);
});

test("live challenge without verifier remains candidate", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-test-"));
  const result = await solveChallenge({
    challenge: {
      id: "x",
      title: "x",
      description: "x",
      flag_regex: "FLAG\\{[^}]+\\}",
    },
    policy: basePolicy(),
    state: baseState(root),
    runRoot: root,
    session: new MockSession(["CTF_RACER_FLAG=FLAG{done}"]),
    skillNames: [],
  });

  assert.equal(result.state.status, "candidate");
  assert.equal(result.state.flag_verified, false);
});

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

test("keeps one session across continuation rounds and stops on flag", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-test-"));
  const state = {
    challenge_id: "x",
    status: "prepared",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    workspace: root,
    rounds: 0,
  };
  const result = await solveChallenge({
    challenge: { id: "x", title: "x", description: "x", flag_regex: "FLAG\\{[^}]+\\}" },
    policy: { max_continuation_rounds: 4, allow_external_web_research: false, allow_challenge_network: false, auto_submit: false },
    state,
    runRoot: root,
    session: new MockSession(["still investigating", "CTF_RACER_FLAG=FLAG{done}"]),
  });
  assert.equal(result.state.status, "solved");
  assert.equal(result.state.rounds, 2);
  assert.equal(result.state.flag, "FLAG{done}");
  assert.equal(result.responses.length, 2);
});

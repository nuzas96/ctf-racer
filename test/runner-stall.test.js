import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { solveChallenge } from "../src/runner.js";

class RepeatingSession {
  constructor(response) {
    this.response = response;
    this.calls = 0;
  }

  async run() {
    this.calls += 1;
    return { finalResponse: this.response };
  }
}

test("stops after repeated stalled rounds while reusing the same session", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-runner-stall-"));
  fs.mkdirSync(path.join(root, "solve"), { recursive: true });
  fs.writeFileSync(path.join(root, "PROGRESS.md"), "# Validated findings\n\n");

  const state = {
    challenge_id: "stall-test",
    status: "prepared",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    workspace: root,
    rounds: 0,
  };

  const session = new RepeatingSession(
    "Still analyzing the same hypothesis without a new result.\nCTF_RACER_STALLED=no new evidence"
  );

  const result = await solveChallenge({
    challenge: {
      id: "stall-test",
      title: "stall",
      description: "stall",
      flag_regex: "FLAG\\{[^}]+\\}",
      flag_format: "FLAG{...}",
    },
    policy: {
      max_continuation_rounds: 4,
      max_consecutive_stalls: 2,
      stall_similarity_threshold: 0.8,
      allow_external_web_research: false,
      allow_challenge_network: false,
      auto_submit: false,
    },
    state,
    runRoot: root,
    session,
    skillName: null,
  });

  assert.equal(result.state.status, "stalled");
  assert.equal(result.state.rounds, 2);
  assert.equal(result.state.stall_count, 2);
  assert.equal(session.calls, 2);
  assert.equal(result.state.round_diagnostics.length, 2);
  assert.equal(result.state.round_diagnostics[1].stalled, true);
});

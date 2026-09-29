import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  evaluateRound,
  jaccardSimilarity,
  snapshotProgress,
} from "../src/stall.js";

test("workspace changes count as measurable progress", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-stall-"));
  fs.mkdirSync(path.join(workspace, "solve"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "FINDINGS.md"), "# findings\n");

  const before = snapshotProgress(workspace);
  fs.appendFileSync(path.join(workspace, "FINDINGS.md"), "Recovered nonce reuse primitive.\n");
  const after = snapshotProgress(workspace);

  const result = evaluateRound({
    before,
    after,
    response: "Confirmed AES-CTR nonce reuse.",
  });
  assert.equal(result.stalled, false);
  assert.equal(result.workspaceChanged, true);
});

test("repeated no-change response is detected as stalled", () => {
  const snap = { digest: "same", files: [] };
  const result = evaluateRound({
    before: snap,
    after: snap,
    response: "I am still analyzing the same nonce reuse hypothesis and need more work.",
    previousResponses: ["I am still analyzing the same nonce reuse hypothesis and need more work."],
    similarityThreshold: 0.8,
  });
  assert.equal(result.stalled, true);
  assert.ok(result.maxSimilarity >= 0.8);
});

test("explicit progress marker prevents no-change false stall", () => {
  const snap = { digest: "same", files: [] };
  const result = evaluateRound({
    before: snap,
    after: snap,
    response: "CTF_RACER_PROGRESS=recovered first 12 plaintext bytes",
  });
  assert.equal(result.stalled, false);
});

test("jaccard similarity distinguishes repeated from different responses", () => {
  assert.ok(jaccardSimilarity("same attack same nonce", "same attack same nonce") > 0.99);
  assert.ok(jaccardSimilarity("nonce reuse", "heap overflow offset") < 0.5);
});

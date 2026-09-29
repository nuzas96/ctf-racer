import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runPreflight } from "../src/preflight.js";

test("detects AES-CTR nonce reuse in JSON artifacts", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-preflight-"));
  const artifacts = path.join(workspace, "artifacts");
  fs.mkdirSync(artifacts, { recursive: true });
  fs.writeFileSync(path.join(artifacts, "messages.json"), JSON.stringify({
    cipher: "AES-CTR",
    messages: [
      { sender: "a", nonce: "deadbeef", ciphertext: "QUFBQQ==" },
      { sender: "b", nonce: "deadbeef", ciphertext: "QkJCQg==" },
      { sender: "c", nonce: "cafebabe", ciphertext: "Q0NDQw==" }
    ]
  }));

  const result = runPreflight(workspace, { category: "crypto" });
  assert.equal(result.findingCount, 1);
  assert.equal(result.highCount, 1);
  assert.match(result.findings[0].evidence, /deadbeef/);
  assert.match(result.findings[0].implication, /C1 XOR C2 = P1 XOR P2/);

  const report = fs.readFileSync(path.join(workspace, "PREFLIGHT.md"), "utf8");
  assert.match(report, /AES-CTR nonce reuse detected/);
  assert.match(report, /crib dragging/);
});

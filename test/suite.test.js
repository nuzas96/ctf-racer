import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { precheckSuite } from "../src/suite.js";

function writeChallenge(dir, artifactPresent) {
  fs.mkdirSync(path.join(dir, "files"), { recursive: true });
  const data = Buffer.from("suite-artifact\n", "utf8");
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");
  fs.writeFileSync(
    path.join(dir, "challenge.json"),
    JSON.stringify({
      id: path.basename(dir),
      title: path.basename(dir),
      description: "test",
      category: "misc",
      flag_sha256: "0".repeat(64),
      artifact_manifest: [{ path: "artifact.bin", size: data.length, sha256 }],
    })
  );
  if (artifactPresent) fs.writeFileSync(path.join(dir, "files", "artifact.bin"), data);
}

test("suite precheck reports missing required artifacts before model calls", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-suite-"));
  writeChallenge(path.join(root, "benchmarks", "ready"), true);
  writeChallenge(path.join(root, "benchmarks", "missing"), false);

  const suitePath = path.join(root, "benchmarks", "suite.json");
  fs.writeFileSync(
    suitePath,
    JSON.stringify({
      id: "test-suite",
      benchmarks: [
        { path: "benchmarks/ready", required: true },
        { path: "benchmarks/missing", required: true },
      ],
    })
  );

  const check = precheckSuite(root, suitePath);
  assert.equal(check.entries[0].artifact_status, "ok");
  assert.equal(check.entries[1].artifact_status, "error");
  assert.match(check.entries[1].error, /artifact verification failed/);
});

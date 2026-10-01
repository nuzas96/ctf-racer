import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { artifactStatus, assertChallengeArtifacts, importSingleArtifact } from "../src/artifacts.js";

test("imports and verifies a benchmark artifact by exact size and SHA-256", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-artifact-"));
  const challengeDir = path.join(root, "challenge");
  fs.mkdirSync(challengeDir, { recursive: true });

  const source = path.join(root, "source.bin");
  const data = Buffer.from("artifact-test-data\n", "utf8");
  fs.writeFileSync(source, data);
  const sha256 = crypto.createHash("sha256").update(data).digest("hex");

  const challenge = {
    artifact_manifest: [
      { path: "artifact.bin", size: data.length, sha256 },
    ],
  };

  assert.equal(artifactStatus(challengeDir, challenge)[0].reason, "missing");

  const imported = importSingleArtifact(challengeDir, challenge, source);
  assert.equal(imported.sha256, sha256);

  const status = assertChallengeArtifacts(challengeDir, challenge);
  assert.equal(status.length, 1);
  assert.equal(status[0].ok, true);
});


test("rejects artifact manifest path traversal", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-artifact-path-"));
  const challenge = {
    artifact_manifest: [
      { path: "../escape.bin", size: 1, sha256: "0".repeat(64) },
    ],
  };

  const status = artifactStatus(root, challenge);
  assert.equal(status.length, 1);
  assert.equal(status[0].ok, false);
  assert.match(status[0].reason, /escapes files directory/);
});

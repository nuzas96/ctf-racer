import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { artifactStatus, assertChallengeArtifacts, fetchChallengeArtifacts, importSingleArtifact } from "../src/artifacts.js";

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


test("verifies a local artifact by Git blob SHA-1", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-gitblob-"));
  const files = path.join(root, "files");
  fs.mkdirSync(files, { recursive: true });
  const data = Buffer.from("git-blob-fixture\n", "utf8");
  const header = Buffer.from("blob " + data.length + "\0", "utf8");
  const gitBlobSha1 = crypto.createHash("sha1").update(header).update(data).digest("hex");
  fs.writeFileSync(path.join(files, "fixture.bin"), data);

  const challenge = {
    artifact_manifest: [
      { path: "fixture.bin", size: data.length, git_blob_sha1: gitBlobSha1 },
    ],
  };

  const status = assertChallengeArtifacts(root, challenge);
  assert.equal(status[0].ok, true);
  assert.equal(status[0].git_blob_sha1, gitBlobSha1);
});

test("fetches and verifies a canonical public benchmark artifact", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-fetch-"));
  const data = Buffer.from("remote-fixture\n", "utf8");
  const header = Buffer.from("blob " + data.length + "\0", "utf8");
  const gitBlobSha1 = crypto.createHash("sha1").update(header).update(data).digest("hex");
  const previousFetch = globalThis.fetch;

  globalThis.fetch = async () => new Response(data, { status: 200 });
  try {
    const challenge = {
      artifact_manifest: [
        {
          path: "fixture.bin",
          size: data.length,
          git_blob_sha1: gitBlobSha1,
          url: "https://raw.githubusercontent.com/example/repo/main/fixture.bin",
        },
      ],
    };

    const fetched = await fetchChallengeArtifacts(root, challenge);
    assert.equal(fetched.length, 1);
    assert.equal(fetched[0].git_blob_sha1, gitBlobSha1);
    assert.equal(
      fs.readFileSync(path.join(root, "files", "fixture.bin"), "utf8"),
      data.toString("utf8")
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

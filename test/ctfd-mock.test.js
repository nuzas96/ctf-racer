import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  materializeCtfdMockSnapshot,
  normalizeCtfCategory,
  runCtfdMockCycle,
  validateCtfdAttachmentUrl,
  validateCtfdBaseUrl,
  validateCtfdRedirect,
} from "../src/ctfd-mock.js";

const digest = (x) => crypto.createHash("sha256").update(x).digest("hex");
function fixtureRoot() { return fs.mkdtempSync(path.join(os.tmpdir(), "ctfd-offline-")); }
function snapshot({ description = "Offline fixture challenge", solved_by_me = false, updated_at = "2026-11-06T12:00:00Z" } = {}) {
  const bytes = Buffer.from("benign archived attachment\n");
  return {
    baseUrl: "https://ctfd.mock.invalid",
    response: { success: true, data: [{ id: 17, name: "Fixture Crypto", description, category: "Crypto", type: "standard", state: "visible", solved_by_me, updated_at, files: [{ id: 81, name: "sample.txt", location: "/files/81/sample.txt", sha1sum: crypto.createHash("sha1").update(bytes).digest("hex") }] }] },
    downloads: { "81": bytes.toString("base64") },
    bytes,
  };
}
function paths(root) {
  return { intakeRoot: path.join(root, "incoming"), stateFile: path.join(root, "controller", "ctfd-state.json") };
}

test("CTFd categories map to canonical Racer categories", () => {
  assert.equal(normalizeCtfCategory("Cryptography"), "crypto");
  assert.equal(normalizeCtfCategory("Binary Exploitation"), "pwn");
  assert.equal(normalizeCtfCategory("Reverse Engineering"), "reverse");
  assert.equal(normalizeCtfCategory("Forensics"), "forensics");
  assert.equal(normalizeCtfCategory("Odd Platform Category"), "unknown");
});

test("CTFd URL policy rejects credentials, HTTP, off-origin URLs, traversal and redirects", () => {
  assert.throws(() => validateCtfdBaseUrl("http://ctfd.mock.invalid"), /https/);
  assert.throws(() => validateCtfdBaseUrl("https://user:pass@ctfd.mock.invalid"), /credentials/);
  assert.equal(validateCtfdAttachmentUrl("https://ctfd.mock.invalid", "/files/8/a.bin").pathname, "/files/8/a.bin");
  assert.throws(() => validateCtfdAttachmentUrl("https://ctfd.mock.invalid", "https://other.invalid/files/a"), /origin/);
  assert.throws(() => validateCtfdAttachmentUrl("https://ctfd.mock.invalid", "/files/%2e%2e/secret"), /path/);
  assert.throws(() => validateCtfdRedirect("https://ctfd.mock.invalid", "https://other.invalid/files/a"), /redirect/);
});

test("snapshot intake materializes normalized metadata, pinned bytes and detects new/unchanged/updated/solved", () => {
  const root = fixtureRoot();
  const p = paths(root);
  const f = snapshot();
  const first = materializeCtfdMockSnapshot({ ...f, ...p });
  assert.equal(first.changes[0].change, "new");
  const dir = path.join(p.intakeRoot, "ctfd-17");
  const challenge = JSON.parse(fs.readFileSync(path.join(dir, "challenge.json"), "utf8"));
  assert.equal(challenge.id, "ctfd-17");
  assert.equal(challenge.category, "crypto");
  assert.equal(challenge.platform.id, "17");
  assert.equal(challenge.attachments[0].sha256, digest(f.bytes));
  assert.equal(fs.readFileSync(path.join(dir, "files", "sample.txt"), "utf8"), "benign archived attachment\n");
  assert.equal("flag_sha256" in challenge, false);
  assert.equal(materializeCtfdMockSnapshot({ ...f, ...p }).changes[0].change, "unchanged");
  const updated = snapshot({ description: "Updated description", updated_at: "2026-11-06T13:00:00Z" });
  assert.equal(materializeCtfdMockSnapshot({ ...updated, ...p }).changes[0].change, "updated");
  assert.equal(materializeCtfdMockSnapshot({ ...f, ...p }).changes[0].change, "stale_ignored");
  const solved = snapshot({ solved_by_me: true, description: "Solved upstream", updated_at: "2026-11-06T14:00:00Z" });
  assert.equal(materializeCtfdMockSnapshot({ ...solved, ...p }).changes[0].change, "already_solved");
});

test("snapshot validation fails closed on malformed response, unsafe names and attachment hash mismatch", () => {
  const root = fixtureRoot();
  const p = paths(root);
  const f = snapshot();
  assert.throws(() => materializeCtfdMockSnapshot({ ...f, ...p, response: { success: false, data: [] } }), /response/);
  const nullId = structuredClone(f);
  nullId.response.data[0].id = null;
  assert.throws(() => materializeCtfdMockSnapshot({ ...nullId, ...p }), /id must be an integer/);
  const secretField = structuredClone(f);
  secretField.response.data[0].solution = "private";
  assert.throws(() => materializeCtfdMockSnapshot({ ...secretField, ...p }), /answer\/credential-bearing/);
  const badName = structuredClone(f);
  badName.response.data[0].files[0].name = "../answer.txt";
  assert.throws(() => materializeCtfdMockSnapshot({ ...badName, ...p }), /filename/);
  const badHash = structuredClone(f);
  badHash.response.data[0].files[0].sha1sum = "0".repeat(40);
  assert.throws(() => materializeCtfdMockSnapshot({ ...badHash, ...p }), /SHA-1 mismatch/);
  assert.throws(() => materializeCtfdMockSnapshot({ ...f, ...p, maxAttachmentBytes: 4, maxTotalAttachmentBytes: 8 }), /size limit/);
  const duplicateFile = structuredClone(f);
  duplicateFile.response.data[0].files.push({ ...duplicateFile.response.data[0].files[0], id: 82 });
  assert.throws(() => materializeCtfdMockSnapshot({ ...duplicateFile, ...p }), /duplicate CTFd attachment filename/);
});

test("snapshot accepts the separately captured challenge-files endpoint shape", () => {
  const root = fixtureRoot();
  const p = paths(root);
  const f = snapshot();
  const response = structuredClone(f.response);
  delete response.data[0].files;
  const result = materializeCtfdMockSnapshot({
    baseUrl: f.baseUrl,
    response,
    attachmentsByChallengeId: { "17": { success: true, data: [{ id: 81, type: "challenge", location: "/files/81/sample.txt", sha1sum: crypto.createHash("sha1").update(f.bytes).digest("hex") }] } },
    downloads: f.downloads,
    ...p,
  });
  assert.equal(result.ready.length, 1);
  assert.equal(fs.readFileSync(path.join(p.intakeRoot, "ctfd-17", "files", "sample.txt"), "utf8"), "benign archived attachment\n");
});

test("empty challenge releases produce a clean no-op without invoking the solver", async () => {
  const root = fixtureRoot();
  const result = await runCtfdMockCycle({
    projectRoot: root,
    baseUrl: "https://ctfd.mock.invalid",
    response: { success: true, data: [] },
    downloads: {},
    intakeRoot: path.join(root, "incoming"),
    stateFile: path.join(root, "controller", "state.json"),
    executeSolver: async () => { throw new Error("must not run on empty challenge release"); },
  });
  assert.equal(result.challenges.length, 0);
});

test("offline end-to-end path reuses intake and race, verifies controller-side, and simulates CTFd acceptance", async () => {
  const root = fixtureRoot();
  const p = paths(root);
  const f = snapshot();
  const answer = "flag{controller_verified_mock}";
  const expected = digest(answer);
  let solverCalls = 0;
  const report = await runCtfdMockCycle({
    projectRoot: root,
    ...f,
    ...p,
    verifierDigests: { "17": expected },
    executeSolver: async ({ challenge }) => {
      solverCalls++;
      assert.equal(challenge.category, "crypto");
      assert.equal("flag_sha256" in challenge, false);
      return { candidate: answer, rounds: 1 };
    },
    simulateSubmission: true,
    mockSubmissionRules: { "17": { expected_submission: answer, latency_ms: 4 } },
  });
  assert.equal(solverCalls, 1);
  assert.equal(report.challenges[0].verified, true);
  assert.equal(report.submissions[0].status, "accepted");
  for (const key of ["intake_ms", "queue_ms", "solver_ms", "verification_ms", "mock_submission_ms"]) {
    assert.ok(report.timings[key] >= 0, `${key} timing should be nonnegative`);
  }
  const second = await runCtfdMockCycle({ projectRoot: root, ...f, ...p, verifierDigests: { "17": expected }, executeSolver: async () => { solverCalls++; return { candidate: answer }; }, simulateSubmission: true, mockSubmissionRules: { "17": { expected_submission: answer, latency_ms: 1 } } });
  assert.equal(solverCalls, 1, "unchanged solved challenge is not dispatched twice");
  assert.equal(second.challenges.length, 0);
});

test("mock submission defaults off and wrong candidates are never submitted", async () => {
  const root = fixtureRoot();
  const p = paths(root);
  const f = snapshot();
  const common = { projectRoot: root, ...f, ...p, verifierDigests: { "17": digest("correct") }, executeSolver: async () => ({ candidate: "wrong" }) };
  const off = await runCtfdMockCycle({ ...common, mockSubmissionRules: { "17": { expected_submission: "wrong", latency_ms: 0 } } });
  assert.equal(off.submissions.length, 0);
  assert.equal(off.challenges[0].verified, false);
  const reject = await runCtfdMockCycle({ ...common, simulateSubmission: true, mockSubmissionRules: { "17": { expected_submission: "wrong", latency_ms: 2 } } });
  assert.equal(reject.submissions.length, 0);
});

test("mock CTFd API can reject a locally verified candidate without persisting it", async () => {
  const root = fixtureRoot();
  const f = snapshot();
  const answer = "locally-correct";
  const rejected = await runCtfdMockCycle({
    projectRoot: root,
    ...f,
    ...paths(root),
    verifierDigests: { "17": digest(answer) },
    executeSolver: async () => ({ candidate: answer }),
    simulateSubmission: true,
    mockSubmissionRules: { "17": { expected_submission: "mock-API-expects-different-value", latency_ms: 3 } },
  });
  assert.equal(rejected.challenges[0].verified, true);
  assert.equal(rejected.submissions[0].status, "rejected");
  assert.equal(JSON.stringify(rejected).includes(answer), false);
  assert.equal(fs.readFileSync(paths(root).stateFile, "utf8").includes(answer), false);
});

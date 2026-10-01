import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { threadOptions } from "../src/agent.js";
import { policyForChallenge } from "../src/config.js";
import { healthcheck, safeServicePath, createDynamicFlag, serviceFileStatus, withChallengeService, startChallengeService } from "../src/service.js";
import { verifyFlagCandidate } from "../src/flag.js";
import { prepareWorkspace } from "../src/workspace.js";
import { solveChallenge } from "../src/runner.js";
import { summarizeRuns } from "../src/benchmark.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "racer-service-test-"));
const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
const close = (server) => new Promise((resolve) => server.close(resolve));

test("dynamic flags are random and independently verified by SHA-256", () => {
  const challenge = { service: { dynamic_flag_env: "FLAG" } };
  const a = createDynamicFlag(challenge), b = createDynamicFlag(challenge);
  assert.notEqual(a.raw, b.raw);
  assert.equal(a.sha256, crypto.createHash("sha256").update(a.raw).digest("hex"));
  assert.equal(verifyFlagCandidate(a.raw, a.sha256), true);
  assert.equal(verifyFlagCandidate(b.raw, a.sha256), false);
  assert.equal(createDynamicFlag({}), null);
});

test("service paths reject traversal and symlinks", () => {
  const root = tmp();
  assert.throws(() => safeServicePath(root, "../escape"), /traversal/);
  assert.throws(() => safeServicePath(root, "/tmp/escape"), /invalid/);
  fs.symlinkSync(os.tmpdir(), path.join(root, "link"));
  assert.throws(() => safeServicePath(root, "link/escape"), /symlink/);
  assert.equal(serviceFileStatus(root, { service: { directory: "service" }, service_manifest: [{ path: "../escape", size: 1, sha256: "0".repeat(64) }] })[0].ok, false);
});

test("HTTP healthcheck requires the configured successful status", async () => {
  const server = http.createServer((_req, res) => { res.statusCode = 200; res.end("ok"); });
  const port = await listen(server);
  try { await healthcheck({ kind: "http", url: `http://127.0.0.1:${port}/`, expected_status: 200, timeout_ms: 500 }); }
  finally { await close(server); }
});

test("TCP healthcheck connects to localhost", async () => {
  const server = net.createServer((socket) => socket.end());
  const port = await listen(server);
  try { await healthcheck({ kind: "tcp", host: "127.0.0.1", port, timeout_ms: 500 }); }
  finally { await close(server); }
});

test("service cleanup runs on success and solver error without Docker", async () => {
  const root = tmp(), source = path.join(root, "challenge"), serviceDir = path.join(source, "service"), bin = path.join(root, "bin");
  fs.mkdirSync(serviceDir, { recursive: true }); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(serviceDir, "compose.yaml"), "services: {}\n");
  const log = path.join(root, "docker.log");
  const script = path.join(bin, "docker");
  fs.writeFileSync(script, '#!/bin/sh\nprintf "%s\\n" "$*" >> "$RACER_DOCKER_TEST_LOG"\nif [ "$1" = ps ]; then printf "%s:%s->1025/tcp\\n" "$RACER_DOCKER_TEST_BIND" "$RACER_DOCKER_TEST_PORT"; fi\n'); fs.chmodSync(script, 0o755);
  const server = net.createServer((socket) => socket.end());
  const port = await listen(server);
  const challenge = { id: "mock", service: { kind: "docker-compose", directory: "service", compose_file: "compose.yaml", runtime_files: ["compose.yaml"], local_port: port, dynamic_flag_env: "FLAG", healthcheck: { kind: "tcp", host: "127.0.0.1", port, timeout_ms: 500 } } };
  const oldPath = process.env.PATH;
  const before = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("ctf-racer-service-")));
  process.env.PATH = `${bin}:${oldPath}`; process.env.RACER_DOCKER_TEST_LOG = log; process.env.RACER_DOCKER_TEST_PORT = String(port); process.env.RACER_DOCKER_TEST_BIND = "127.0.0.1";
  try {
    await withChallengeService(source, challenge, async (handle) => { assert.match(handle.flag_sha256, /^[a-f0-9]{64}$/); });
    await assert.rejects(withChallengeService(source, challenge, async () => { throw new Error("solver failed"); }), /solver failed/);
    const calls = fs.readFileSync(log, "utf8").trim().split("\n");
    assert.equal(calls.filter((line) => line.includes(" up ")).length, 2);
    assert.equal(calls.filter((line) => line.includes(" down ")).length, 2);
    process.env.RACER_DOCKER_TEST_BIND = "0.0.0.0";
    await assert.rejects(startChallengeService(source, challenge), /localhost port is not published/);
    assert.equal(fs.readFileSync(log, "utf8").split("\n").filter((line) => line.includes(" down ")).length, 3);
    assert.deepEqual(new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("ctf-racer-service-")).filter((name) => !before.has(name))), new Set());
  } finally { process.env.PATH = oldPath; delete process.env.RACER_DOCKER_TEST_LOG; delete process.env.RACER_DOCKER_TEST_PORT; delete process.env.RACER_DOCKER_TEST_BIND; await close(server); }
});

test("static service path remains disabled", async () => {
  assert.equal(await startChallengeService(tmp(), { id: "static" }), null);
});

test("Codex network is explicit and external research stays disabled", () => {
  const policy = { sandbox_mode: "workspace-write", approval_policy: "never", model: "gpt-6-luna", model_reasoning_effort: "medium" };
  assert.equal(threadOptions("/tmp/work", policy).networkAccessEnabled, false);
  const enabled = threadOptions("/tmp/work", { ...policy, allow_challenge_network: true });
  assert.equal(enabled.networkAccessEnabled, true);
  assert.equal(enabled.sandboxMode, "workspace-write");
  assert.equal(enabled.webSearchMode, "disabled");
  assert.equal(enabled.webSearchEnabled, false);
  const candidate = { ...policy, allow_external_web_research: true, allow_challenge_network: true };
  assert.equal(policyForChallenge(candidate, {}, null).allow_challenge_network, false);
  assert.equal(policyForChallenge(candidate, { service: { network_access: false } }, { network_access: true }).allow_challenge_network, false);
  assert.equal(policyForChallenge(candidate, { service: { network_access: true } }, { network_access: false }).allow_challenge_network, false);
  const approved = policyForChallenge(candidate, { service: { network_access: true } }, { network_access: true });
  assert.equal(approved.allow_challenge_network, true);
  assert.equal(approved.allow_external_web_research, false);
});

test("dynamic flag is absent from workspace, state, response and benchmark summary", async () => {
  const root = tmp(), source = path.join(root, "source"); fs.mkdirSync(source);
  const challenge = { id: "dynamic-test", title: "test", category: "web", description: "test", flag_regex: "csaw\\{[^}]+\\}", service: { dynamic_flag_env: "FLAG", flag_prefix: "csaw{racer_" } };
  const dynamic = createDynamicFlag(challenge);
  const state = prepareWorkspace(root, source, challenge);
  const runRoot = path.join(root, "runs", challenge.id);
  const handle = { flag_sha256: dynamic.sha256, redact: (s) => String(s).replaceAll(dynamic.raw, "[REDACTED_FLAG]"), scrubWorkspace: (workspace) => {
    const progress = path.join(workspace, "PROGRESS.md");
    fs.writeFileSync(progress, fs.readFileSync(progress, "utf8").replaceAll(dynamic.raw, "[REDACTED_FLAG]"));
  } };
  const result = await solveChallenge({ challenge: { ...challenge, flag_sha256: dynamic.sha256 }, policy: { max_continuation_rounds: 1, max_consecutive_stalls: 2, stall_similarity_threshold: 0.82, allow_external_web_research: false, allow_challenge_network: true, auto_submit: false }, state, runRoot, service: handle, skillNames: [], session: { run: async () => { fs.appendFileSync(path.join(state.workspace, "PROGRESS.md"), dynamic.raw); return { finalResponse: `CTF_RACER_FLAG=${dynamic.raw}` }; } } });
  const report = JSON.stringify(summarizeRuns([{ status: result.state.status, flag_verified: result.state.flag_verified, rounds: result.state.rounds }]));
  for (const file of [path.join(state.workspace, "CHALLENGE.md"), path.join(state.workspace, "PROGRESS.md"), path.join(runRoot, "state.json"), path.join(runRoot, "run.log"), path.join(runRoot, "response-1.md")]) assert.equal(fs.readFileSync(file, "utf8").includes(dynamic.raw), false);
  assert.equal(report.includes(dynamic.raw), false);
  assert.equal(result.state.status, "solved");
  assert.equal(result.state.flag, undefined);
});

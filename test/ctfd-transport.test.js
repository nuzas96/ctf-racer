import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { CtfdTransportClient, CtfdTransportError, runCtfdTransportCycle } from "../src/ctfd-transport.js";
import { solverEnvironment } from "../src/solver-env.js";
import { verifierProbeFiles, verifierReadPaths, verifyVerifierIsolation } from "../src/verifier-isolation.js";

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const sha1 = (value) => crypto.createHash("sha1").update(value).digest("hex");
const ACCESS_TOKEN = "ctfd-test-controller-token-never-for-solver";
const FLAG = "flag{fixture_candidate_only}";
const FILE_BYTES = Buffer.from("benign local CTFd attachment\n");

function makeCertificate(directory) {
  const keyPath = path.join(directory, "server.key");
  const certPath = path.join(directory, "server.crt");
  const result = spawnSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath,
    "-out", certPath, "-days", "2", "-subj", "/CN=ctfd.mock.test",
    "-addext", "subjectAltName=DNS:ctfd.mock.test",
  ], { encoding: "utf8", stdio: "ignore" });
  if (result.error || result.status !== 0) throw new Error("local test requires openssl to create an ephemeral TLS fixture");
  return { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath), ca: fs.readFileSync(certPath) };
}

async function makeServer(t, { challengeList, files, responseForSubmission, onRequest, responseMode } = {}) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "ctfd-tls-mock-"));
  const tls = makeCertificate(temp);
  const fixture = {
    challenges: challengeList ?? [{ id: 17, name: "Fixture Crypto", description: "Local-only transport test", category: "Crypto", type: "standard", state: "visible", solved_by_me: false, updated_at: "2026-11-06T12:00:00Z" }],
    files: files ?? [{ id: 81, name: "sample.txt", location: "/files/81/sample.txt", sha1sum: sha1(FILE_BYTES) }],
    responseForSubmission: responseForSubmission ?? (() => ({ status: 200, json: { success: true, data: { status: "correct", message: "accepted" } } })),
    onRequest,
    responseMode,
    requests: [],
  };
  const server = https.createServer(tls, (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      let parsed = null;
      if (body.length) { try { parsed = JSON.parse(body.toString("utf8")); } catch {} }
      const seen = { method: req.method, url: req.url, host: req.headers.host, authorization: req.headers.authorization, body: parsed, remoteAddress: req.socket.remoteAddress };
      fixture.requests.push(seen);
      if (fixture.onRequest) {
        const handled = fixture.onRequest(req, res, seen, fixture);
        if (handled === true) return;
      }
      if (fixture.responseMode === "redirect" && req.url === "/api/v1/challenges") {
        res.writeHead(302, { Location: "https://elsewhere.invalid/api/v1/challenges" }).end();
        return;
      }
      if (fixture.responseMode === "large" && req.url === "/api/v1/challenges") {
        const payload = Buffer.alloc(2048, 0x61);
        res.writeHead(200, { "Content-Length": payload.length, "Content-Type": "application/json" }).end(payload);
        return;
      }
      if (req.method === "GET" && req.url === "/api/v1/challenges") {
        json(res, 200, { success: true, data: fixture.challenges });
      } else if (req.method === "GET" && /^\/api\/v1\/challenges\/\d+\/files$/.test(req.url)) {
        json(res, 200, { success: true, data: fixture.files });
      } else if (req.method === "GET" && req.url.startsWith("/files/")) {
        res.writeHead(200, { "Content-Length": FILE_BYTES.length, "Content-Type": "application/octet-stream" }).end(FILE_BYTES);
      } else if (req.method === "POST" && req.url === "/api/v1/challenges/attempt") {
        const outcome = fixture.responseForSubmission(parsed?.submission, seen);
        if (outcome.hang) return;
        if (outcome.redirect) { res.writeHead(307, { Location: outcome.redirect }).end(); return; }
        json(res, outcome.status, outcome.json, outcome.headers);
      } else {
        json(res, 404, { success: false });
      }
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  });
  return { server, fixture, tls, baseUrl: `https://ctfd.mock.test:${server.address().port}` };
}

function json(response, status, value, headers = {}) {
  const body = Buffer.from(JSON.stringify(value ?? {}));
  response.writeHead(status, { "Content-Type": "application/json", "Content-Length": body.length, ...headers });
  response.end(body);
}

function clientFor(server, overrides = {}) {
  return new CtfdTransportClient({
    baseUrl: server.baseUrl,
    allowedAddresses: ["127.0.0.1"],
    apiToken: ACCESS_TOKEN,
    ca: server.tls.ca,
    resolver: async (host) => host === "ctfd.mock.test" ? [{ address: "127.0.0.1", family: 4 }] : [{ address: "127.0.0.2", family: 4 }],
    timeoutMs: 500,
    ...overrides,
  });
}

test("local TLS CTFd transport runs snapshot -> adapter -> scheduler -> isolated fixture -> verifier -> mock submission", async (t) => {
  const server = await makeServer(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctfd-e2e-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "project");
  const privateRoot = path.join(projectRoot, "runs", "_ctfd-controller");
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const verifierRoot = path.join(projectRoot, "runs", "_verifiers");
  fs.mkdirSync(verifierRoot, { recursive: true, mode: 0o700 });
  const verifierFile = path.join(verifierRoot, "fixture.sha256");
  fs.writeFileSync(verifierFile, `${sha256(FLAG)}\n`, { mode: 0o600 });
  const controllerCanary = path.join(privateRoot, "credential-canary.json");
  fs.writeFileSync(controllerCanary, '{"test_only":"controller credential canary"}\n', { mode: 0o600 });
  const probeSource = path.join(projectRoot, "local-challenges", "isolation-fixture");
  fs.mkdirSync(probeSource, { recursive: true });
  fs.writeFileSync(path.join(probeSource, "challenge.json"), '{"id":"isolation-fixture"}\n', { mode: 0o600 });
  const probeWorkspace = path.join(projectRoot, "runs", "isolation-fixture", "workspace");
  fs.mkdirSync(path.join(probeWorkspace, "solve"), { recursive: true });
  const isolation = verifyVerifierIsolation({
    projectRoot,
    workspace: probeWorkspace,
    deniedPaths: verifierReadPaths({ projectRoot }),
    probeFiles: verifierProbeFiles({ projectRoot, sourceDir: probeSource, additionalFiles: [verifierFile, controllerCanary] }),
    localServicePort: server.server.address().port,
  });
  assert.equal(isolation.passed, true, JSON.stringify(isolation));
  assert.equal(isolation.network_isolation.runner_loopback_connect, "denied");
  assert.ok(Object.values(isolation.probe_file_access).every((probe) => probe.direct_denied && probe.symlink_denied && probe.hardlink_denied));
  const journal = path.join(privateRoot, "submissions.json");
  const client = clientFor(server, { projectRoot, submissionEnabled: true, submissionJournalPath: journal, minimumSubmissionIntervalMs: 0 });
  const suppliedEnv = solverEnvironment({ ...process.env, CTFD_API_TOKEN: ACCESS_TOKEN, CTFD_ACCESS_TOKEN: "sentinel", CTF_RACER_CTFD_SECRET: "sentinel" });
  const result = await runCtfdTransportCycle({
    client,
    projectRoot,
    intakeRoot: path.join(root, "incoming"),
    stateFile: path.join(privateRoot, "adapter-state.json"),
    verifierDigests: { "17": sha256(FLAG) },
    submitVerifiedCandidates: true,
    executeSolver: async ({ sourceDir }) => {
      const child = spawnSync(process.execPath, ["-e", "process.stdout.write(JSON.stringify({api:process.env.CTFD_API_TOKEN||null,access:process.env.CTFD_ACCESS_TOKEN||null,secret:process.env.CTF_RACER_CTFD_SECRET||null}))"], { env: suppliedEnv, encoding: "utf8" });
      assert.equal(child.status, 0);
      assert.deepEqual(JSON.parse(child.stdout), { api: null, access: null, secret: null });
      assert.equal(path.relative(sourceDir, privateRoot).startsWith(".."), true);
      return { candidate: FLAG, rounds: 1 };
    },
  });

  assert.equal(result.challenges.length, 1);
  assert.equal(result.challenges[0].verified, true);
  assert.equal(result.submissions[0].status, "correct");
  assert.equal(result.transport.challenge_count, 1);
  assert.equal(result.transport.attachment_count, 1);
  assert.ok(result.transport.attachment_bytes > 0);
  assert.equal(server.fixture.requests.length, 4);
  assert.ok(server.fixture.requests.every((request) => request.authorization === `Token ${ACCESS_TOKEN}`));
  assert.equal(server.fixture.requests.at(-1).body.challenge_id, 17);
  assert.equal(server.fixture.requests.at(-1).body.submission, FLAG);
  assert.equal(server.fixture.requests.every((request) => request.remoteAddress === "127.0.0.1"), true);
  assert.equal(server.fixture.requests.every((request) => request.host === `ctfd.mock.test:${server.server.address().port}`), true);
  const journalText = fs.readFileSync(journal, "utf8");
  assert.doesNotMatch(journalText, new RegExp(ACCESS_TOKEN));
  assert.equal(journalText.includes(FLAG), false);
  assert.equal(fs.statSync(journal).mode & 0o777, 0o600);
  const paths = verifierReadPaths({ projectRoot });
  assert.ok(paths.includes(privateRoot));
  assert.ok(paths.includes(path.join(projectRoot, "runs", "_verifiers")));
});

test("transport exposes updates and stale snapshots to the existing offline adapter", async (t) => {
  const server = await makeServer(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctfd-updates-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const client = clientFor(server);
  const projectRoot = path.join(root, "project");
  const common = { client, projectRoot, intakeRoot: path.join(root, "incoming"), stateFile: path.join(root, "controller", "state.json"), verifierDigests: {}, executeSolver: async () => ({ candidate: null }) };

  const first = await runCtfdTransportCycle(common);
  assert.equal(first.materialized.changes[0].change, "new");
  server.fixture.challenges = [{ ...server.fixture.challenges[0], description: "new version", updated_at: "2026-11-06T13:00:00Z" }];
  const updated = await runCtfdTransportCycle(common);
  assert.equal(updated.materialized.changes[0].change, "updated");
  server.fixture.challenges = [{ ...server.fixture.challenges[0], description: "stale version", updated_at: "2026-11-06T11:00:00Z" }];
  const stale = await runCtfdTransportCycle(common);
  assert.equal(stale.materialized.changes[0].change, "stale_ignored");
  assert.equal(stale.challenges.length, 0);
});

test("TLS errors, DNS drift, redirects and oversized responses fail closed without leaking credentials", async (t) => {
  const redirectServer = await makeServer(t, { responseMode: "redirect" });
  const redirectClient = clientFor(redirectServer);
  await assert.rejects(redirectClient.fetchSnapshot(), (error) => error.code === "REDIRECT_DENIED" && !error.message.includes(ACCESS_TOKEN));
  assert.equal(redirectServer.fixture.requests.length, 1);

  const deniedDns = clientFor(redirectServer, { resolver: async () => [{ address: "127.0.0.2", family: 4 }] });
  await assert.rejects(deniedDns.fetchSnapshot(), (error) => error.code === "DNS_DENIED");
  assert.equal(redirectServer.fixture.requests.length, 1);

  let lookupCount = 0;
  const rebindingServer = await makeServer(t);
  const rebinding = clientFor(rebindingServer, { resolver: async () => [{ address: ++lookupCount === 1 ? "127.0.0.1" : "127.0.0.2", family: 4 }] });
  await assert.rejects(rebinding.fetchSnapshot(), (error) => error.code === "DNS_DENIED");
  assert.equal(rebindingServer.fixture.requests.length, 1); // Challenge list reached the pinned IP; next DNS change was blocked before files.

  const largeServer = await makeServer(t, { responseMode: "large" });
  const largeClient = clientFor(largeServer, { maxJsonBytes: 1024 });
  await assert.rejects(largeClient.fetchSnapshot(), (error) => error.code === "RESPONSE_TOO_LARGE");

  const badTrust = clientFor(redirectServer, { ca: "-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----\n" });
  await assert.rejects(badTrust.fetchSnapshot(), (error) => error.code === "REQUEST_FAILED" && !error.message.includes(ACCESS_TOKEN));

  const wrongHost = new CtfdTransportClient({
    baseUrl: redirectServer.baseUrl.replace("ctfd.mock.test", "other.mock.test"),
    allowedAddresses: ["127.0.0.1"], apiToken: ACCESS_TOKEN, ca: redirectServer.tls.ca,
    resolver: async () => [{ address: "127.0.0.1", family: 4 }], timeoutMs: 500,
  });
  await assert.rejects(wrongHost.fetchSnapshot(), (error) => error.code === "REQUEST_FAILED");
  assert.equal(redirectServer.fixture.requests.length, 1);
});

test("attachment URL must remain same-host, normalized and under /files", async (t) => {
  const server = await makeServer(t, { files: [{ id: 81, name: "bad.bin", location: "https://elsewhere.invalid/files/bad.bin" }] });
  const client = clientFor(server);
  await assert.rejects(client.fetchSnapshot(), /outside the configured HTTPS origin/);
  assert.equal(server.fixture.requests.length, 2);
});

test("transport refuses partial paginated listings until a tested page schema is configured", async (t) => {
  const server = await makeServer(t, {
    onRequest: (req, res) => {
      if (req.method === "GET" && req.url === "/api/v1/challenges") {
        json(res, 200, { success: true, data: [], meta: { pagination: { page: 1, pages: 2, total: 20 } } });
        return true;
      }
      return false;
    },
  });
  await assert.rejects(clientFor(server).fetchSnapshot(), (error) => error.code === "PAGINATION_UNSUPPORTED");
  assert.equal(server.fixture.requests.length, 1);
});

test("platform submit is gated on independent controller verification", async (t) => {
  const server = await makeServer(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctfd-unverified-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "project");
  const privateRoot = path.join(projectRoot, "runs", "_ctfd-controller");
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const client = clientFor(server, {
    projectRoot,
    submissionEnabled: true,
    submissionJournalPath: path.join(privateRoot, "journal.json"),
    minimumSubmissionIntervalMs: 0,
  });
  const result = await runCtfdTransportCycle({
    client,
    projectRoot,
    intakeRoot: path.join(root, "incoming"),
    stateFile: path.join(privateRoot, "adapter-state.json"),
    verifierDigests: { "17": sha256("different expected value") },
    submitVerifiedCandidates: true,
    executeSolver: async () => ({ candidate: FLAG }),
  });
  assert.equal(result.challenges[0].verified, false);
  assert.deepEqual(result.submissions, []);
  assert.equal(server.fixture.requests.some((request) => request.method === "POST"), false);
});

test("submission is disabled by default, explicit fixtures cover rejection, duplicate, rate-limit and uncertain retry recovery", async (t) => {
  const server = await makeServer(t, {
    responseForSubmission: (candidate) => {
      if (candidate === "throttled-candidate") return { status: 429, headers: { "Retry-After": "0.05" }, json: { success: true, data: { status: "ratelimited", message: "wait" } } };
      if (candidate === "uncertain-candidate") return { hang: true };
      return { status: 200, json: { success: true, data: { status: candidate === FLAG ? "correct" : "incorrect", message: "fixture" } } };
    },
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctfd-submit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "project");
  const journal = path.join(projectRoot, "runs", "_ctfd-controller", "journal.json");
  const disabled = clientFor(server);
  await assert.rejects(disabled.submitFlag({ challengeId: 17, candidate: FLAG }), (error) => error.code === "SUBMISSION_DISABLED");

  const client = clientFor(server, { projectRoot, submissionEnabled: true, submissionJournalPath: journal, minimumSubmissionIntervalMs: 0, timeoutMs: 100 });
  assert.equal((await client.submitFlag({ challengeId: 17, candidate: FLAG })).status, "correct");
  assert.equal((await client.submitFlag({ challengeId: 17, candidate: FLAG })).status, "duplicate_suppressed");
  assert.equal((await client.submitFlag({ challengeId: 17, candidate: "wrong-candidate" })).status, "incorrect");
  const limited = await client.submitFlag({ challengeId: 17, candidate: "throttled-candidate" });
  assert.equal(limited.status, "ratelimited");
  assert.equal(limited.retry_after_ms, 50);
  assert.equal((await client.submitFlag({ challengeId: 17, candidate: "another-candidate" })).status, "local_rate_limited");
  await new Promise((resolve) => setTimeout(resolve, 60));
  await assert.rejects(client.submitFlag({ challengeId: 17, candidate: "uncertain-candidate" }), (error) => error.code === "REQUEST_TIMEOUT");
  assert.equal((await client.submitFlag({ challengeId: 17, candidate: "uncertain-candidate" })).status, "duplicate_suppressed");

  const attempts = server.fixture.requests.filter((request) => request.method === "POST");
  assert.equal(attempts.length, 4);
  assert.equal(attempts.filter((request) => request.body.submission === "uncertain-candidate").length, 1);
  const stored = fs.readFileSync(journal, "utf8");
  for (const candidate of [FLAG, "wrong-candidate", "throttled-candidate", "uncertain-candidate"]) assert.ok(!stored.includes(candidate));
  assert.ok(!stored.includes(ACCESS_TOKEN));
});

test("submission statuses are strictly parsed and unrecognized outcomes become uncertain", async (t) => {
  const server = await makeServer(t, { responseForSubmission: () => ({ status: 200, json: { success: true, data: { status: "future_status" } } }) });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctfd-schema-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "project");
  const client = clientFor(server, { projectRoot, submissionEnabled: true, submissionJournalPath: path.join(projectRoot, "runs", "_ctfd-controller", "journal.json"), minimumSubmissionIntervalMs: 0 });
  await assert.rejects(client.submitFlag({ challengeId: 17, candidate: "fixture" }), (error) => error.code === "SUBMISSION_RESPONSE_UNKNOWN");
  assert.equal((await client.submitFlag({ challengeId: 17, candidate: "fixture" })).status, "duplicate_suppressed");
});

test("concurrent controller instances share a durable lock and CTFd legacy boolean verdicts are normalized", async (t) => {
  const server = await makeServer(t, {
    onRequest: (req, res) => {
      if (req.method !== "POST") return false;
      setTimeout(() => json(res, 200, { success: true, data: { status: true, message: "accepted" } }), 40);
      return true;
    },
  });
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctfd-lock-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const projectRoot = path.join(root, "project");
  const journal = path.join(projectRoot, "runs", "_ctfd-controller", "journal.json");
  const options = { projectRoot, submissionEnabled: true, submissionJournalPath: journal, minimumSubmissionIntervalMs: 0 };
  const first = clientFor(server, options);
  const second = clientFor(server, options);
  const results = await Promise.all([
    first.submitFlag({ challengeId: 17, candidate: "bool-verdict-fixture" }),
    second.submitFlag({ challengeId: 17, candidate: "bool-verdict-fixture" }),
  ]);
  assert.deepEqual(results.map((result) => result.status).sort(), ["correct", "submission_in_progress"]);
  assert.equal(server.fixture.requests.filter((request) => request.method === "POST").length, 1);
});

test("solver environment strips CTFd credentials while preserving unrelated Codex settings", () => {
  const environment = solverEnvironment({
    CTFD_API_TOKEN: "secret",
    CTFD_AUTH_TOKEN: "secret",
    CTF_RACER_CTFD_SECRET: "secret",
    CODEX_HOME: "/tmp/codex-home",
    PATH: "/usr/bin",
    LANG: "C.UTF-8",
  });
  assert.deepEqual(environment, { CODEX_HOME: "/tmp/codex-home", PATH: "/usr/bin", LANG: "C.UTF-8" });
});

test("enabled submissions require a journal in the isolated controller-private root", async (t) => {
  const server = await makeServer(t);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctfd-private-path-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.throws(() => clientFor(server, {
    projectRoot: path.join(root, "project"),
    submissionEnabled: true,
    submissionJournalPath: path.join(root, "unprotected.json"),
  }), /direct child of runs\/_ctfd-controller/);
});

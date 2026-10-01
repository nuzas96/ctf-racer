import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { assertChallengeArtifacts } from "./artifacts.js";

const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");
const blobHash = (data) => crypto.createHash("sha1").update(Buffer.from(`blob ${data.length}\0`)).update(data).digest("hex");

export function safeServicePath(root, relative) {
  if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) throw new Error("invalid service path");
  const base = path.resolve(root);
  const full = path.resolve(base, relative);
  if (!full.startsWith(base + path.sep)) throw new Error("service path traversal");
  let current = base;
  for (const part of path.relative(base, full).split(path.sep)) {
    current = path.join(current, part);
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) throw new Error("service symlink rejected");
  }
  return full;
}

function serviceRoot(sourceDir, challenge) {
  return safeServicePath(sourceDir, challenge.service.directory ?? "service");
}

export function serviceFileStatus(sourceDir, challenge) {
  if (!challenge.service) return [];
  const root = serviceRoot(sourceDir, challenge);
  return (challenge.service_manifest ?? []).map((item) => {
    try {
      const file = safeServicePath(root, item.path);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return { path: item.path, ok: false, reason: "missing" };
      const data = fs.readFileSync(file);
      const ok = data.length === item.size &&
        (!item.git_blob_sha1 || blobHash(data) === item.git_blob_sha1) &&
        (!item.sha256 || hash(data) === item.sha256) &&
        Boolean(item.git_blob_sha1 || item.sha256);
      return { path: item.path, ok, reason: ok ? undefined : "integrity mismatch" };
    } catch (error) { return { path: item.path, ok: false, reason: error.message }; }
  });
}

export function assertChallengeServiceFiles(sourceDir, challenge) {
  if (!challenge.service) return [];
  const service = challenge.service;
  if (service.kind !== "docker-compose") throw new Error("unsupported service kind");
  if (!Array.isArray(service.runtime_files) || !service.runtime_files.includes(service.compose_file ?? "compose.yaml")) throw new Error("service runtime_files must include compose file");
  const status = serviceFileStatus(sourceDir, challenge);
  const bad = status.find((item) => !item.ok);
  if (bad) throw new Error(`service file ${bad.path}: ${bad.reason}`);
  const root = serviceRoot(sourceDir, challenge);
  if ((service.runtime_artifacts ?? []).length) assertChallengeArtifacts(sourceDir, challenge);
  if ((challenge.service_manifest ?? []).length && service.runtime_files.some((relative) => !challenge.service_manifest.some((item) => item.path === relative))) throw new Error("unverified service runtime file");
  for (const relative of service.runtime_files) {
    const file = safeServicePath(root, relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`missing service runtime file: ${relative}`);
  }
  for (const relative of service.runtime_artifacts ?? []) {
    const file = safeServicePath(path.join(sourceDir, challenge.files_dir ?? "files"), relative);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`missing service artifact: ${relative}`);
    if (!(challenge.artifact_manifest ?? []).some((item) => item.path === relative)) throw new Error(`unverified service artifact: ${relative}`);
  }
  const health = service.healthcheck;
  if (!health || !["http", "tcp"].includes(health.kind)) throw new Error("service healthcheck required");
  const host = health.kind === "http" ? new URL(health.url).hostname : health.host;
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) throw new Error("service healthcheck must use localhost");
  if (!Number.isInteger(service.local_port) || service.local_port < 1 || service.local_port > 65535) throw new Error("invalid local service port");
  const healthPort = health.kind === "http" ? Number(new URL(health.url).port || 80) : Number(health.port);
  if (healthPort !== service.local_port) throw new Error("service healthcheck port must match local_port");
  if (service.dynamic_flag_env && service.dynamic_flag_file) throw new Error("choose one dynamic flag injection method");
  return status;
}

export async function fetchChallengeServiceFiles(sourceDir, challenge) {
  const manifest = challenge.service_manifest ?? [];
  const root = serviceRoot(sourceDir, challenge);
  const results = [];
  for (const item of manifest) {
    const destination = safeServicePath(root, item.path);
    const url = new URL(item.url);
    if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com") throw new Error("service fetch URL rejected");
    const response = await fetch(url, { redirect: "error" });
    if (!response.ok) throw new Error(`service fetch failed: ${item.path} HTTP ${response.status}`);
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length !== item.size || (item.git_blob_sha1 && blobHash(data) !== item.git_blob_sha1) || (item.sha256 && hash(data) !== item.sha256)) throw new Error(`service download integrity mismatch: ${item.path}`);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data);
    results.push(item.path);
  }
  assertChallengeServiceFiles(sourceDir, challenge);
  return results;
}

export function createDynamicFlag(challenge) {
  if (!challenge.service?.dynamic_flag_env && !challenge.service?.dynamic_flag_file) return null;
  const raw = `${challenge.service.flag_prefix ?? "FLAG{racer_"}${crypto.randomBytes(16).toString("hex")}${challenge.service.flag_suffix ?? "}"}`;
  if (challenge.flag_regex && !new RegExp(`^(?:${challenge.flag_regex})$`).test(raw)) throw new Error("generated flag does not match challenge flag_regex");
  return { raw, sha256: hash(raw) };
}

export function healthcheck(health) {
  const timeout = health.timeout_ms ?? 60000;
  const deadline = Date.now() + timeout;
  return new Promise((resolve, reject) => {
    const retry = () => Date.now() >= deadline ? reject(new Error(`${health.kind} healthcheck timed out`)) : setTimeout(attempt, 300);
    const attempt = () => {
      if (health.kind === "tcp") {
        const socket = net.createConnection({ host: health.host, port: health.port });
        let done = false;
        const fail = () => { if (done) return; done = true; socket.destroy(); retry(); };
        socket.setTimeout(1000, fail);
        socket.once("error", fail);
        socket.once("connect", () => { if (done) return; done = true; socket.end(); resolve(); });
      } else if (health.kind === "http") {
        const request = http.get(health.url, { timeout: 1500 }, (response) => {
          response.resume();
          response.statusCode === (health.expected_status ?? 200) ? resolve() : retry();
        });
        request.once("error", retry);
        request.once("timeout", () => { request.destroy(); retry(); });
      } else reject(new Error("unsupported healthcheck"));
    };
    attempt();
  });
}

function compose(runtimeDir, project, file, action, env, secret) {
  const args = ["compose", "-p", project, "-f", file, ...action];
  const result = spawnSync("docker", args, { cwd: runtimeDir, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error(`docker compose ${action[0]} failed: ${String(result.stderr || result.stdout || result.error || "unknown").replaceAll(secret ?? "\0", "[REDACTED]").trim()}`);
}

function assertLocalBindings(project, port, env) {
  const result = spawnSync("docker", ["ps", "--filter", `label=com.docker.compose.project=${project}`, "--format", "{{.Ports}}"], { env, encoding: "utf8" });
  if (result.status !== 0) throw new Error("could not inspect service port bindings");
  const published = result.stdout.split(/[\n,]/).map((value) => value.trim()).filter((value) => value.includes("->"));
  if (!published.some((value) => value.startsWith(`127.0.0.1:${port}->`))) throw new Error("service localhost port is not published");
  if (published.some((value) => !/^127\.0\.0\.1:\d+->/.test(value) && !/^\[::1\]:\d+->/.test(value))) throw new Error("service exposes a non-localhost port");
}

export async function startChallengeService(sourceDir, challenge) {
  if (!challenge.service) return null;
  assertChallengeServiceFiles(sourceDir, challenge);
  const service = challenge.service;
  const runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-service-"));
  fs.chmodSync(runtimeDir, 0o700);
  const secretDir = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-secret-"));
  fs.chmodSync(secretDir, 0o700);
  const dynamic = createDynamicFlag(challenge);
  const project = `racer-${crypto.randomBytes(8).toString("hex")}`;
  const composeFile = service.compose_file ?? "compose.yaml";
  const env = { ...process.env, ...(service.environment ?? {}) };
  try {
    for (const relative of service.runtime_files) {
      const src = safeServicePath(serviceRoot(sourceDir, challenge), relative);
      const dst = safeServicePath(runtimeDir, relative);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    for (const relative of service.runtime_artifacts ?? []) {
      const src = safeServicePath(path.join(sourceDir, challenge.files_dir ?? "files"), relative);
      const dst = safeServicePath(runtimeDir, relative);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    if (dynamic && service.dynamic_flag_env) env[service.dynamic_flag_env] = dynamic.raw;
    if (dynamic && service.dynamic_flag_file) {
      const secretFile = safeServicePath(secretDir, service.dynamic_flag_file);
      fs.writeFileSync(secretFile, dynamic.raw + "\n", { mode: 0o644 });
      env.RUNTIME_FLAG_FILE = secretFile;
    }
    compose(runtimeDir, project, composeFile, ["up", "-d", "--build", "--remove-orphans"], env, dynamic?.raw);
    assertLocalBindings(project, service.local_port, env);
    await healthcheck(service.healthcheck);
    return {
      flag_sha256: dynamic?.sha256 ?? null,
      network_access: service.network_access === true,
      redact: (value) => dynamic ? String(value).replaceAll(dynamic.raw, "[REDACTED_FLAG]") : String(value),
      scrubWorkspace: (workspace) => {
        if (!dynamic) return;
        const secretBytes = Buffer.from(dynamic.raw);
        const visit = (dir) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const file = path.join(dir, entry.name);
            if (entry.isDirectory()) visit(file);
            else if (entry.isFile()) {
              const data = fs.readFileSync(file);
              let index = data.indexOf(secretBytes);
              if (index === -1) continue;
              do {
                data.fill(0x58, index, index + secretBytes.length);
                index = data.indexOf(secretBytes, index + secretBytes.length);
              } while (index !== -1);
              fs.writeFileSync(file, data);
            }
          }
        };
        visit(workspace);
      },
      stop: () => {
        try { compose(runtimeDir, project, composeFile, ["down", "-v", "--remove-orphans"], env, dynamic?.raw); }
        finally { fs.rmSync(runtimeDir, { recursive: true, force: true }); fs.rmSync(secretDir, { recursive: true, force: true }); delete env[service.dynamic_flag_env]; }
      },
    };
  } catch (error) {
    try { compose(runtimeDir, project, composeFile, ["down", "-v", "--remove-orphans"], env, dynamic?.raw); }
    catch { /* preserve startup error */ }
    fs.rmSync(runtimeDir, { recursive: true, force: true });
    fs.rmSync(secretDir, { recursive: true, force: true });
    throw error;
  }
}

export async function stopChallengeService(handle) {
  if (handle) handle.stop();
}

export async function withChallengeService(sourceDir, challenge, run) {
  const handle = await startChallengeService(sourceDir, challenge);
  try { return await run(handle); }
  finally { await stopChallengeService(handle); }
}

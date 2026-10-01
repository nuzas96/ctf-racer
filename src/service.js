import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";

function safeServicePath(rootDir, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error("service path must be a non-empty relative path");
  }
  const root = path.resolve(rootDir);
  const full = path.resolve(root, relativePath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("service path escapes service directory");
  }
  return full;
}

function sha256Buffer(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function gitBlobSha1Buffer(data) {
  const header = Buffer.from("blob " + data.length + "\0", "utf8");
  return crypto.createHash("sha1").update(header).update(data).digest("hex");
}

function serviceRoot(sourceDir, challenge) {
  return path.join(sourceDir, challenge.service?.directory ?? "service");
}

export function serviceFileStatus(sourceDir, challenge) {
  const manifest = Array.isArray(challenge.service_manifest) ? challenge.service_manifest : [];
  const root = serviceRoot(sourceDir, challenge);

  return manifest.map((item) => {
    const relativePath = String(item.path ?? "").trim();
    let fullPath;
    try {
      fullPath = safeServicePath(root, relativePath);
    } catch (error) {
      return { path: relativePath, ok: false, reason: error instanceof Error ? error.message : String(error) };
    }

    const expectedSize = Number(item.size);
    const expectedGitBlobSha1 = String(item.git_blob_sha1 ?? "").toLowerCase();
    const expectedSha256 = String(item.sha256 ?? "").toLowerCase();
    const hasGit = /^[a-f0-9]{40}$/.test(expectedGitBlobSha1);
    const hasSha = /^[a-f0-9]{64}$/.test(expectedSha256);

    if (!hasGit && !hasSha) return { path: relativePath, ok: false, reason: "manifest needs git_blob_sha1 or sha256" };
    if (!Number.isInteger(expectedSize) || expectedSize < 0) return { path: relativePath, ok: false, reason: "invalid manifest size" };
    if (!fs.existsSync(fullPath)) return { path: relativePath, full_path: fullPath, ok: false, reason: "missing" };

    const data = fs.readFileSync(fullPath);
    if (data.length !== expectedSize) {
      return { path: relativePath, full_path: fullPath, ok: false, reason: "size mismatch", expected_size: expectedSize, actual_size: data.length };
    }

    const actualGit = gitBlobSha1Buffer(data);
    if (hasGit && actualGit !== expectedGitBlobSha1) {
      return { path: relativePath, full_path: fullPath, ok: false, reason: "git blob sha1 mismatch", expected_git_blob_sha1: expectedGitBlobSha1, actual_git_blob_sha1: actualGit };
    }

    const actualSha = sha256Buffer(data);
    if (hasSha && actualSha !== expectedSha256) {
      return { path: relativePath, full_path: fullPath, ok: false, reason: "sha256 mismatch", expected_sha256: expectedSha256, actual_sha256: actualSha };
    }

    return { path: relativePath, full_path: fullPath, ok: true, size: data.length, git_blob_sha1: actualGit, sha256: actualSha };
  });
}

export function assertChallengeServiceFiles(sourceDir, challenge) {
  if (!challenge.service) return [];
  const status = serviceFileStatus(sourceDir, challenge);
  const failed = status.filter((item) => !item.ok);
  if (failed.length > 0) {
    throw new Error("challenge service verification failed: " + failed.map((item) => item.path + ": " + item.reason).join("; "));
  }

  const root = serviceRoot(sourceDir, challenge);
  const composeFile = safeServicePath(root, challenge.service.compose_file ?? "compose.yaml");
  if (!fs.existsSync(composeFile)) throw new Error("challenge service compose file missing: " + composeFile);
  return status;
}

function validateRawGithubUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com") {
    throw new Error("service fetch only allows https://raw.githubusercontent.com");
  }
  return url;
}

export async function fetchChallengeServiceFiles(sourceDir, challenge) {
  const manifest = Array.isArray(challenge.service_manifest) ? challenge.service_manifest : [];
  if (manifest.length === 0) return [];
  const root = serviceRoot(sourceDir, challenge);
  const results = [];

  for (const item of manifest) {
    const relativePath = String(item.path ?? "").trim();
    const url = validateRawGithubUrl(String(item.url ?? ""));
    const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "ctf-racer-service-fetch" } });
    if (!response.ok) throw new Error("service download failed for " + relativePath + ": HTTP " + response.status);
    const data = Buffer.from(await response.arrayBuffer());

    if (data.length !== Number(item.size)) throw new Error("service size mismatch for " + relativePath);
    if (item.git_blob_sha1 && gitBlobSha1Buffer(data) !== String(item.git_blob_sha1).toLowerCase()) {
      throw new Error("service Git blob SHA-1 mismatch for " + relativePath);
    }
    if (item.sha256 && sha256Buffer(data) !== String(item.sha256).toLowerCase()) {
      throw new Error("service SHA-256 mismatch for " + relativePath);
    }

    const destination = safeServicePath(root, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data);
    results.push({ path: relativePath, destination, size: data.length });
  }

  assertChallengeServiceFiles(sourceDir, challenge);
  return results;
}

export function challengeHasDynamicVerifier(challenge) {
  return Boolean(challenge.service?.dynamic_flag_env);
}

export function createDynamicFlag(challenge) {
  if (!challengeHasDynamicVerifier(challenge)) return null;
  const prefix = challenge.service.flag_prefix ?? "csaw{racer_";
  const suffix = challenge.service.flag_suffix ?? "}";
  const raw = prefix + crypto.randomBytes(12).toString("hex") + suffix;
  return { raw, sha256: sha256Buffer(Buffer.from(raw, "utf8")) };
}

function composeArgs(challenge, action) {
  const service = challenge.service;
  const projectName = service.project_name ?? ("ctf-racer-" + challenge.id).replace(/[^a-zA-Z0-9_-]/g, "-");
  const composeFile = service.compose_file ?? "compose.yaml";
  if (action === "up") {
    return ["compose", "-p", projectName, "-f", composeFile, "up", "-d", "--build", "--remove-orphans"];
  }
  return ["compose", "-p", projectName, "-f", composeFile, "down", "-v", "--remove-orphans"];
}

function runCompose(root, challenge, action, env) {
  const result = spawnSync("docker", composeArgs(challenge, action), {
    cwd: root,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0 && action === "up") {
    throw new Error("docker compose up failed: " + (result.stderr || result.stdout || "unknown error").trim());
  }
  return result;
}

function waitTcp(host, port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.createConnection({ host, port });
      let settled = false;
      const fail = () => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (Date.now() >= deadline) reject(new Error("TCP service healthcheck timed out"));
        else setTimeout(attempt, 400);
      };
      socket.setTimeout(1000, fail);
      socket.once("error", fail);
      socket.once("connect", () => {
        if (settled) return;
        settled = true;
        socket.end();
        resolve();
      });
    };
    attempt();
  });
}

function waitHttp(urlString, expectedStatus, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const url = new URL(urlString);
      const lib = url.protocol === "https:" ? https : http;
      const request = lib.get(url, { timeout: 1500 }, (response) => {
        response.resume();
        if (response.statusCode === expectedStatus) resolve();
        else retry();
      });
      const retry = () => {
        request.destroy();
        if (Date.now() >= deadline) reject(new Error("HTTP service healthcheck timed out"));
        else setTimeout(attempt, 400);
      };
      request.once("error", retry);
      request.once("timeout", retry);
    };
    attempt();
  });
}

async function waitForHealth(challenge) {
  const health = challenge.service?.healthcheck;
  if (!health) return;
  const timeoutMs = Number(health.timeout_ms ?? 60000);
  if (health.kind === "tcp") {
    await waitTcp(health.host ?? "127.0.0.1", Number(health.port), timeoutMs);
    return;
  }
  if (health.kind === "http") {
    await waitHttp(health.url, Number(health.expected_status ?? 200), timeoutMs);
    return;
  }
  throw new Error("unsupported service healthcheck kind: " + health.kind);
}

export async function startChallengeService(sourceDir, challenge) {
  if (!challenge.service) return null;
  if (challenge.service.kind !== "docker-compose") {
    throw new Error("unsupported challenge service kind: " + challenge.service.kind);
  }

  assertChallengeServiceFiles(sourceDir, challenge);
  const root = serviceRoot(sourceDir, challenge);
  const dynamicFlag = createDynamicFlag(challenge);
  const env = { ...process.env, ...(challenge.service.environment ?? {}) };
  if (dynamicFlag) env[challenge.service.dynamic_flag_env] = dynamicFlag.raw;

  runCompose(root, challenge, "down", env);
  try {
    runCompose(root, challenge, "up", env);
    await waitForHealth(challenge);
  } catch (error) {
    runCompose(root, challenge, "down", env);
    throw error;
  }

  return {
    root,
    challenge,
    env,
    flag_sha256: dynamicFlag?.sha256 ?? null,
    network_access: challenge.service.network_access === true,
  };
}

export async function stopChallengeService(handle) {
  if (!handle) return;
  runCompose(handle.root, handle.challenge, "down", handle.env);
}

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { discoverIntakeChallenges, writeIntakeSuite } from "./intake.js";
import { verifyFlagCandidate } from "./flag.js";
import { runRace } from "./race.js";

const CATEGORY = new Map([
  ["crypto", "crypto"], ["cryptography", "crypto"],
  ["pwn", "pwn"], ["binary exploitation", "pwn"], ["exploitation", "pwn"],
  ["reverse", "reverse"], ["reverse engineering", "reverse"],
  ["web", "web"], ["web exploitation", "web"],
  ["forensics", "forensics"], ["forensic", "forensics"],
  ["misc", "misc"], ["miscellaneous", "misc"], ["general skills", "misc"],
  ["osint", "osint"], ["ai/ml", "ai-ml"], ["artificial intelligence", "ai-ml"],
]);

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const safe = (value) => String(value).replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");

/** URL policy for a future CTFd transport. This offline module performs no requests. */
export function validateCtfdBaseUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("CTFd base URL must use https");
  if (url.username || url.password || url.search || url.hash) throw new Error("CTFd base URL cannot include credentials, query, or fragment");
  return url;
}

export function validateCtfdAttachmentUrl(base, raw) {
  const origin = validateCtfdBaseUrl(base);
  const url = new URL(raw, origin);
  if (url.protocol !== "https:" || url.origin !== origin.origin || url.username || url.password || url.hash) {
    throw new Error("CTFd attachment URL must remain on the configured HTTPS origin");
  }
  let segments;
  try { segments = url.pathname.split("/").map(decodeURIComponent); }
  catch { throw new Error("CTFd attachment URL has invalid path encoding"); }
  if (!url.pathname.startsWith("/files/") || segments.some((part) => part === ".." || part === "." || /[\\/\0]/.test(part)) || url.search) {
    throw new Error("CTFd attachment URL must target a normalized /files/ path");
  }
  return url;
}

export function validateCtfdRedirect(base, finalUrl) {
  const origin = validateCtfdBaseUrl(base);
  const final = new URL(finalUrl);
  if (final.protocol !== "https:" || final.origin !== origin.origin || final.username || final.password) {
    throw new Error("CTFd redirect left the configured HTTPS origin");
  }
  return final;
}

export function normalizeCtfCategory(category) {
  return CATEGORY.get(String(category ?? "").trim().toLowerCase()) ?? "unknown";
}

function parseChallengeResponse(response) {
  if (!response || response.success !== true || !Array.isArray(response.data)) {
    throw new Error("mock CTFd response must match {success:true,data:[...]}");
  }
  const ids = new Set();
  for (const item of response.data) {
    const checkKeys = (value) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        if (/^(?:flag|flags|solution|answer|verifier|secret|token|authorization|cookie|password)$/i.test(key)) {
          throw new Error(`refusing answer/credential-bearing CTFd fixture field: ${key}`);
        }
        checkKeys(child);
      }
    };
    checkKeys(item);
    if (!item || !(Number.isSafeInteger(item.id) || (typeof item.id === "string" && /^\d+$/.test(item.id)))) throw new Error("CTFd challenge id must be an integer");
    const id = String(item.id);
    if (ids.has(id)) throw new Error(`duplicate CTFd challenge id ${id}`);
    ids.add(id);
    if (typeof item.name !== "string" || typeof item.description !== "string" || typeof item.category !== "string") {
      throw new Error(`CTFd challenge ${id} is missing name, description, or category`);
    }
  }
  return response.data;
}

function safeAttachmentName(name) {
  const value = String(name ?? "").trim();
  if (!value || value === "." || value === ".." || /[\\/\0]/.test(value)) throw new Error("unsafe CTFd attachment filename");
  return value;
}

function stableFingerprint(challenge, files) {
  return sha256(JSON.stringify({
    name: challenge.name,
    description: challenge.description,
    category: challenge.category,
    type: challenge.type ?? "standard",
    files: files.map(({ id, name, sha256: digest }) => ({ id, name, sha256: digest })),
  }));
}

function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  fs.renameSync(temp, file);
}

/**
 * Materialize a sanitized, already-captured CTFd API response and fixture bytes.
 * Fixture bytes are keyed by platform file id; no URL is fetched here.
 */
export function materializeCtfdMockSnapshot({ baseUrl, response, attachmentsByChallengeId = {}, downloads, intakeRoot, stateFile, maxAttachmentBytes = 50 * 1024 * 1024, maxTotalAttachmentBytes = 200 * 1024 * 1024 }) {
  const started = performance.now();
  if (!Number.isSafeInteger(maxAttachmentBytes) || maxAttachmentBytes < 1 || !Number.isSafeInteger(maxTotalAttachmentBytes) || maxTotalAttachmentBytes < maxAttachmentBytes) {
    throw new Error("invalid CTFd fixture attachment size limits");
  }
  const origin = validateCtfdBaseUrl(baseUrl);
  const challenges = parseChallengeResponse(response);
  if (challenges.length > 500) throw new Error("CTFd fixture exceeds the 500-challenge snapshot limit");
  if (!attachmentsByChallengeId || typeof attachmentsByChallengeId !== "object" || Array.isArray(attachmentsByChallengeId)) {
    throw new Error("attachmentsByChallengeId must be an object map");
  }
  if (!downloads || typeof downloads !== "object" || Array.isArray(downloads)) throw new Error("downloads must map attachment IDs to base64 fixture data");
  fs.mkdirSync(intakeRoot, { recursive: true });
  const prior = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : { version: 1, platform: origin.origin, challenges: {}, submissions: {} };
  if (prior.platform !== origin.origin) throw new Error("state file belongs to a different CTFd origin");
  const state = { version: 1, platform: origin.origin, challenges: { ...prior.challenges }, submissions: { ...prior.submissions } };
  const ready = [];
  const changes = [];
  let totalAttachmentBytes = 0;

  for (const item of challenges) {
    const platformId = String(item.id);
    if (item.state && item.state !== "visible") { changes.push({ platform_id: platformId, change: "not_visible" }); continue; }
    const separateFiles = attachmentsByChallengeId[platformId];
    const fileList = separateFiles === undefined ? (item.files ?? []) : (Array.isArray(separateFiles) ? separateFiles : separateFiles?.success === true && Array.isArray(separateFiles.data) ? separateFiles.data : null);
    if (!Array.isArray(fileList)) throw new Error(`malformed CTFd attachment list for challenge ${platformId}`);
    const attachmentIds = new Set();
    const attachmentNames = new Set();
    const attachments = fileList.map((file) => {
      if (!file || file.id === undefined || file.location === undefined) throw new Error(`challenge ${platformId} has malformed attachment metadata`);
      const attachmentId = String(file.id);
      if (attachmentIds.has(attachmentId)) throw new Error(`duplicate CTFd attachment id ${attachmentId}`);
      attachmentIds.add(attachmentId);
      const url = validateCtfdAttachmentUrl(origin.href, file.location);
      const name = safeAttachmentName(file.name ?? path.posix.basename(url.pathname));
      if (attachmentNames.has(name)) throw new Error(`duplicate CTFd attachment filename ${name}`);
      attachmentNames.add(name);
      const encoded = downloads[String(file.id)];
      if (typeof encoded !== "string") throw new Error(`mock attachment bytes missing for file id ${file.id}`);
      const bytes = Buffer.from(encoded, "base64");
      if (bytes.toString("base64") !== encoded.replace(/\s/g, "")) throw new Error(`invalid base64 fixture for file id ${file.id}`);
      if (bytes.length > maxAttachmentBytes) throw new Error(`CTFd attachment exceeds size limit for file id ${file.id}`);
      totalAttachmentBytes += bytes.length;
      if (totalAttachmentBytes > maxTotalAttachmentBytes) throw new Error("CTFd fixture attachments exceed the total size limit");
      if (file.sha1sum && crypto.createHash("sha1").update(bytes).digest("hex") !== String(file.sha1sum).toLowerCase()) {
        throw new Error(`CTFd attachment SHA-1 mismatch for file id ${file.id}`);
      }
      return { id: attachmentId, name, bytes, sha256: sha256(bytes) };
    });
    const fingerprint = stableFingerprint(item, attachments);
    const old = state.challenges[platformId];
    if (old?.solved || item.solved_by_me === true) {
      state.challenges[platformId] = { ...(old ?? {}), fingerprint, solved: true, updated_at: item.updated_at ?? old?.updated_at ?? null };
      changes.push({ platform_id: platformId, change: "already_solved" });
      continue;
    }
    if (old?.fingerprint === fingerprint) { changes.push({ platform_id: platformId, change: "unchanged" }); continue; }
    if (old?.updated_at && item.updated_at && Date.parse(item.updated_at) < Date.parse(old.updated_at)) {
      changes.push({ platform_id: platformId, change: "stale_ignored" });
      continue;
    }
    const change = old ? "updated" : "new";
    const dir = path.join(intakeRoot, `ctfd-${safe(platformId)}`);
    if (fs.existsSync(dir)) {
      const dirStat = fs.lstatSync(dir);
      const marker = path.join(dir, ".ctf-racer-ctfd-mock.json");
      if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || !fs.existsSync(marker) || !fs.lstatSync(marker).isFile() || JSON.parse(fs.readFileSync(marker, "utf8")).platform_id !== platformId) {
        throw new Error(`refusing to overwrite unmanaged intake directory ${dir}`);
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const filesDir = path.join(dir, "files");
    fs.mkdirSync(filesDir, { recursive: true });
    const manifest = [];
    const attachmentMetadata = [];
    for (const file of attachments) {
      const destination = path.join(filesDir, file.name);
      fs.writeFileSync(destination, file.bytes, { flag: "w", mode: 0o600 });
      manifest.push({ path: file.name, size: file.bytes.length, sha256: file.sha256 });
      attachmentMetadata.push({ id: file.id, name: file.name, size: file.bytes.length, sha256: file.sha256 });
    }
    const category = normalizeCtfCategory(item.category);
    const normalized = {
      id: `ctfd-${safe(platformId)}`,
      title: item.name,
      description: item.description,
      category,
      platform: { name: "ctfd", origin: origin.origin, id: platformId, type: item.type ?? "standard", updated_at: item.updated_at ?? null },
      files_dir: "files",
      artifact_manifest: manifest,
      attachments: attachmentMetadata,
    };
    atomicJson(path.join(dir, "challenge.json"), normalized);
    atomicJson(path.join(dir, ".ctf-racer-ctfd-mock.json"), { platform_id: platformId, fingerprint });
    state.challenges[platformId] = { fingerprint, solved: false, updated_at: item.updated_at ?? null, local_id: normalized.id };
    ready.push({ platform_id: platformId, local_id: normalized.id, path: dir, category, change });
    changes.push({ platform_id: platformId, change });
  }
  atomicJson(stateFile, state);
  return { ready, changes, state, intake_ms: performance.now() - started };
}

/**
 * Full offline integration path. `executeSolver` is injected (normally a deterministic
 * fixture in tests). Submission is a local simulation and is opt-in.
 */
export async function runCtfdMockCycle({ projectRoot, baseUrl, response, attachmentsByChallengeId = {}, downloads, intakeRoot, stateFile, verifierDigests, executeSolver, simulateSubmission = false, mockSubmissionRules = {}, maxAttachmentBytes, maxTotalAttachmentBytes }) {
  if (typeof executeSolver !== "function") throw new Error("an explicit solver executor is required for offline CTFd simulation");
  if (simulateSubmission !== true && simulateSubmission !== false) throw new Error("simulateSubmission must be boolean");
  const materialized = materializeCtfdMockSnapshot({ baseUrl, response, attachmentsByChallengeId, downloads, intakeRoot, stateFile, ...(maxAttachmentBytes === undefined ? {} : { maxAttachmentBytes }), ...(maxTotalAttachmentBytes === undefined ? {} : { maxTotalAttachmentBytes }) });
  if (!materialized.ready.length) {
    return { materialized, challenges: [], timings: { intake_ms: materialized.intake_ms, queue_ms: 0, solver_ms: 0, verification_ms: 0, mock_submission_ms: 0 }, submissions: [] };
  }
  const suiteDiscovery = discoverIntakeChallenges(intakeRoot);
  const pending = suiteDiscovery.entries.filter((entry) => materialized.ready.some((item) => item.local_id === entry.challenge_id));
  if (!pending.length) return { materialized, challenges: [], timings: { intake_ms: materialized.intake_ms, queue_ms: 0, solver_ms: 0, verification_ms: 0, mock_submission_ms: 0 }, submissions: [] };
  const generated = writeIntakeSuite(projectRoot, intakeRoot, { ...suiteDiscovery, entries: pending });
  const queuedAt = performance.now();
  const queueTimes = new Map();
  const solverTimes = new Map();
  const verificationTimes = new Map();
  const candidates = new Map();
  const result = await runRace({ projectRoot, suitePath: generated.outputPath, concurrency: 1, freshRetries: 0, executeAttempt: async (entry, attempt) => {
    queueTimes.set(entry.challenge_id, performance.now() - queuedAt);
    const solvingAt = performance.now();
    const execution = await executeSolver({ challenge: entry.challenge, sourceDir: entry.sourceDir, attempt });
    solverTimes.set(entry.challenge_id, performance.now() - solvingAt);
    const verificationAt = performance.now();
    const digest = verifierDigests?.[entry.challenge.platform?.id];
    const verified = verifyFlagCandidate(execution?.candidate, digest);
    if (typeof execution?.candidate === "string") candidates.set(entry.challenge_id, execution.candidate);
    verificationTimes.set(entry.challenge_id, performance.now() - verificationAt);
    const terminal = verified ? "solved" : "candidate";
    return { attempt, status: terminal, flag_verified: verified, elapsed_ms: solverTimes.get(entry.challenge_id), rounds: execution?.rounds ?? 1, rejected_candidates: execution?.candidate ? (verified ? 0 : 1) : 0, exit_code: 0 };
  } });

  const state = JSON.parse(fs.readFileSync(stateFile, "utf8"));
  const submissions = [];
  let mockSubmissionMs = 0;
  for (const item of result.challenges) {
    const platformId = item.challenge_id.replace(/^ctfd-/, "");
    if (item.verified) state.challenges[platformId] = { ...state.challenges[platformId], solved: true };
    if (!simulateSubmission || !item.verified) continue;
    const fingerprint = state.challenges[platformId].fingerprint;
    const submissionKey = `${platformId}:${fingerprint}`;
    if (state.submissions[submissionKey]) {
      submissions.push({ platform_id: platformId, status: "duplicate_suppressed", latency_ms: 0 });
      continue;
    }
    const rule = mockSubmissionRules[platformId];
    if (!rule || typeof rule.expected_submission !== "string" || !Number.isInteger(rule.latency_ms) || rule.latency_ms < 0) throw new Error(`mock submission rule missing or invalid for challenge ${platformId}`);
    const started = performance.now();
    // This is an in-process mock endpoint only; the candidate is never persisted or sent over a socket.
    await new Promise((resolve) => setTimeout(resolve, rule.latency_ms));
    mockSubmissionMs += performance.now() - started;
    const accepted = candidates.get(item.challenge_id) === rule.expected_submission;
    const submission = { platform_id: platformId, status: accepted ? "accepted" : "rejected", latency_ms: performance.now() - started };
    state.submissions[submissionKey] = { status: submission.status, attempted_at: new Date().toISOString() };
    if (accepted) state.challenges[platformId] = { ...state.challenges[platformId], solved: true, platform_solved: true };
    submissions.push(submission);
  }
  atomicJson(stateFile, state);
  const id = result.challenges[0]?.challenge_id;
  return {
    materialized,
    challenges: result.challenges.map((item) => ({ ...item, timings: { queue_ms: queueTimes.get(item.challenge_id) ?? 0, solver_ms: solverTimes.get(item.challenge_id) ?? 0, verification_ms: verificationTimes.get(item.challenge_id) ?? 0 } })),
    submissions,
    race_report: result,
    timings: {
      intake_ms: materialized.intake_ms,
      queue_ms: id ? queueTimes.get(id) ?? 0 : 0,
      solver_ms: id ? solverTimes.get(id) ?? 0 : 0,
      verification_ms: id ? verificationTimes.get(id) ?? 0 : 0,
      mock_submission_ms: mockSubmissionMs,
    },
  };
}

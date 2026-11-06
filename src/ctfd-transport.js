import crypto from "node:crypto";
import dns from "node:dns/promises";
import fs from "node:fs";
import https from "node:https";
import net from "node:net";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { runCtfdMockCycle } from "./ctfd-mock.js";

const CTFD_ATTEMPT_STATUSES = new Set([
  "correct", "incorrect", "already_solved", "partial", "ratelimited",
  "authentication_required", "paused",
]);

export class CtfdTransportError extends Error {
  constructor(code, message = "CTFd transport request failed", statusCode = null) {
    super(message);
    this.name = "CtfdTransportError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function validateBaseUrl(raw) {
  let url;
  try { url = new URL(raw); } catch { throw new Error("CTFd base URL is invalid"); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("CTFd base URL must be an HTTPS origin without credentials, path, query, or fragment");
  }
  const host = url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname;
  if (!host) throw new Error("CTFd base URL must include a hostname");
  return url;
}

function transportHostname(url) {
  return url.hostname.startsWith("[") && url.hostname.endsWith("]") ? url.hostname.slice(1, -1) : url.hostname;
}

function normalizeAddresses(addresses) {
  if (!Array.isArray(addresses) || addresses.length < 1 || addresses.length > 32) {
    throw new Error("CTFd allowedAddresses must contain 1 to 32 exact IP addresses");
  }
  const unique = [...new Set(addresses)];
  if (unique.some((address) => typeof address !== "string" || net.isIP(address) === 0)) {
    throw new Error("CTFd allowedAddresses must contain exact IPv4 or IPv6 addresses");
  }
  return new Set(unique);
}

function validateAttachmentLocation(base, raw) {
  let url;
  try { url = new URL(raw, base); } catch { throw new Error("CTFd attachment location is invalid"); }
  if (url.protocol !== "https:" || url.origin !== base.origin || url.username || url.password || url.hash) {
    throw new Error("CTFd attachment is outside the configured HTTPS origin");
  }
  let decoded;
  try { decoded = url.pathname.split("/").map(decodeURIComponent); }
  catch { throw new Error("CTFd attachment path encoding is invalid"); }
  if (!url.pathname.startsWith("/files/") || decoded.some((part) => part === "." || part === ".." || /[\\/\0]/.test(part))) {
    throw new Error("CTFd attachment must use a normalized /files/ path");
  }
  return url;
}

function safeChallengeId(value) {
  const id = String(value ?? "");
  if (!/^\d{1,12}$/.test(id)) throw new Error("CTFd challenge id must be a decimal integer");
  return id;
}

function parseJson(bytes, code = "INVALID_JSON") {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw new CtfdTransportError(code, "CTFd returned an invalid JSON response"); }
}

function validateApiList(value, label) {
  if (!value || value.success !== true || !Array.isArray(value.data)) {
    throw new CtfdTransportError("SCHEMA_MISMATCH", `CTFd ${label} response did not match the configured API schema`);
  }
  const pagination = value.meta?.pagination;
  if (pagination && Number(pagination.pages ?? 1) > 1) {
    throw new CtfdTransportError("PAGINATION_UNSUPPORTED", `CTFd ${label} response is paginated; configure a tested pagination schema`);
  }
  return value.data;
}

function filenameFromLocation(url) {
  const segment = url.pathname.split("/").filter(Boolean).at(-1) ?? "";
  try { return decodeURIComponent(segment); } catch { throw new Error("CTFd attachment filename encoding is invalid"); }
}

function safeJournalParent(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) throw new Error("CTFd submission journal path must be absolute");
  const parent = path.dirname(path.resolve(file));
  fs.mkdirSync(parent, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(parent);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) {
    throw new Error("CTFd submission journal directory must be controller-owned and mode 0700 or stricter");
  }
  if (fs.existsSync(file)) {
    const fileStat = fs.lstatSync(file);
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.uid !== process.getuid() || fileStat.nlink !== 1 || (fileStat.mode & 0o077) !== 0) {
      throw new Error("CTFd submission journal must be a private controller-owned regular file");
    }
  }
}

function atomicWrite(file, value) {
  safeJournalParent(file);
  const temp = `${file}.${process.pid}.${crypto.randomBytes(5).toString("hex")}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  try { fs.renameSync(temp, file); }
  finally { try { fs.unlinkSync(temp); } catch {} }
}

function acquireJournalLock(file) {
  const lockPath = `${file}.lock`;
  const lockId = `${process.pid}:${crypto.randomBytes(12).toString("hex")}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx", 0o600);
      try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, lock_id: lockId })); }
      finally { fs.closeSync(fd); }
      return {
        acquired: true,
        release() {
          try {
            const current = JSON.parse(fs.readFileSync(lockPath, "utf8"));
            if (current.lock_id === lockId) fs.unlinkSync(lockPath);
          } catch {}
        },
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw new CtfdTransportError("JOURNAL_LOCK_FAILED", "CTFd submission journal lock could not be created");
      let before;
      let lock;
      try {
        before = fs.lstatSync(lockPath);
        if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || (before.mode & 0o077) !== 0) throw new Error("unsafe lock file");
        lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      } catch { throw new CtfdTransportError("JOURNAL_LOCK_INVALID", "CTFd submission journal lock is invalid"); }
      if (!Number.isSafeInteger(Number(lock.pid)) || Number(lock.pid) < 1 || typeof lock.lock_id !== "string") throw new CtfdTransportError("JOURNAL_LOCK_INVALID", "CTFd submission journal lock is invalid");
      let alive = true;
      try { process.kill(Number(lock.pid), 0); }
      catch (probeError) { if (probeError.code === "ESRCH") alive = false; }
      if (alive) return { acquired: false, release() {} };
      try {
        const after = fs.lstatSync(lockPath);
        if (after.dev === before.dev && after.ino === before.ino) fs.unlinkSync(lockPath);
      } catch {}
    }
  }
  return { acquired: false, release() {} };
}

function retryAfterMs(header, now) {
  if (!header) return 0;
  const value = String(header).trim();
  if (/^\d+(?:\.\d+)?$/.test(value)) return Math.min(3_600_000, Math.max(0, Number(value) * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(3_600_000, Math.max(0, date - now)) : 0;
}

/**
 * Controller-process CTFd client. The configured host is the complete origin
 * allowlist; DNS answers must also be in the explicit IP allowlist and the
 * selected address is pinned for each TLS connection. It never follows redirects.
 */
export class CtfdTransportClient {
  #base;
  #allowedAddresses;
  #token;
  #resolver;
  #ca;
  #timeoutMs;
  #dnsTimeoutMs;
  #maxJsonBytes;
  #maxAttachmentBytes;
  #maxTotalAttachmentBytes;
  #maxChallenges;
  #maxAttachments;
  #snapshotTimeoutMs;
  #submissionEnabled;
  #journalPath;
  #minimumSubmissionIntervalMs;
  #maxSubmissionAttempts;
  #inFlightByChallenge = new Map();

  constructor({
    baseUrl,
    allowedAddresses,
    apiToken,
    resolver = (hostname) => dns.lookup(hostname, { all: true, verbatim: true }),
    ca,
    timeoutMs = 10_000,
    dnsTimeoutMs = 3_000,
    maxJsonBytes = 2 * 1024 * 1024,
    maxAttachmentBytes = 50 * 1024 * 1024,
    maxTotalAttachmentBytes = 200 * 1024 * 1024,
    maxChallenges = 500,
    maxAttachments = 1000,
    snapshotTimeoutMs = 120_000,
    submissionEnabled = false,
    projectRoot = null,
    submissionJournalPath = null,
    minimumSubmissionIntervalMs = 2_000,
    maxSubmissionAttempts = 5,
  }) {
    this.#base = validateBaseUrl(baseUrl);
    this.#allowedAddresses = normalizeAddresses(allowedAddresses);
    if (typeof apiToken !== "string" || apiToken.length < 1 || apiToken.length > 4096 || /[\r\n\0]/.test(apiToken)) {
      throw new Error("CTFd API token must be a non-empty single-line string");
    }
    if (typeof resolver !== "function") throw new Error("CTFd resolver must be a function");
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || !Number.isSafeInteger(dnsTimeoutMs) || dnsTimeoutMs < 1) throw new Error("CTFd request and DNS timeouts must be positive integers");
    if (!Number.isSafeInteger(maxJsonBytes) || maxJsonBytes < 128 || !Number.isSafeInteger(maxAttachmentBytes) || maxAttachmentBytes < 1 || !Number.isSafeInteger(maxTotalAttachmentBytes) || maxTotalAttachmentBytes < maxAttachmentBytes) throw new Error("CTFd response size limits are invalid");
    if (!Number.isSafeInteger(maxChallenges) || maxChallenges < 1 || maxChallenges > 500 || !Number.isSafeInteger(maxAttachments) || maxAttachments < 1 || maxAttachments > 1000) throw new Error("CTFd item limits are invalid");
    if (!Number.isSafeInteger(snapshotTimeoutMs) || snapshotTimeoutMs < 1) throw new Error("CTFd snapshot timeout must be a positive integer");
    if (typeof submissionEnabled !== "boolean") throw new Error("submissionEnabled must be boolean");
    if (!Number.isSafeInteger(minimumSubmissionIntervalMs) || minimumSubmissionIntervalMs < 0 || !Number.isSafeInteger(maxSubmissionAttempts) || maxSubmissionAttempts < 1 || maxSubmissionAttempts > 100) throw new Error("CTFd submission bounds are invalid");
    if (submissionEnabled && !submissionJournalPath) throw new Error("enabled CTFd submission requires a durable private journal");
    if (submissionEnabled) {
      if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot)) throw new Error("enabled CTFd submission requires the absolute CTF Racer projectRoot");
      const privateRoot = path.resolve(projectRoot, "runs", "_ctfd-controller");
      if (path.dirname(path.resolve(submissionJournalPath)) !== privateRoot) throw new Error("CTFd submission journal must be a direct child of runs/_ctfd-controller");
    }
    if (submissionJournalPath) safeJournalParent(submissionJournalPath);

    this.#resolver = resolver;
    this.#ca = ca;
    this.#timeoutMs = timeoutMs;
    this.#dnsTimeoutMs = dnsTimeoutMs;
    this.#maxJsonBytes = maxJsonBytes;
    this.#maxAttachmentBytes = maxAttachmentBytes;
    this.#maxTotalAttachmentBytes = maxTotalAttachmentBytes;
    this.#maxChallenges = maxChallenges;
    this.#maxAttachments = maxAttachments;
    this.#snapshotTimeoutMs = snapshotTimeoutMs;
    this.#submissionEnabled = submissionEnabled;
    this.#journalPath = submissionJournalPath ? path.resolve(submissionJournalPath) : null;
    this.#minimumSubmissionIntervalMs = minimumSubmissionIntervalMs;
    this.#maxSubmissionAttempts = maxSubmissionAttempts;
    this.#token = apiToken;
  }

  get baseUrl() { return this.#base.origin; }
  get submissionEnabled() { return this.#submissionEnabled; }

  async #resolvePinnedAddress() {
    const hostname = transportHostname(this.#base);
    let timerHandle;
    let records;
    try {
      records = await Promise.race([
        Promise.resolve(this.#resolver(hostname)),
        new Promise((_, reject) => { timerHandle = setTimeout(() => reject(new CtfdTransportError("DNS_TIMEOUT", "CTFd DNS resolution timed out")), this.#dnsTimeoutMs); }),
      ]);
    }
    catch (error) {
      if (error instanceof CtfdTransportError) throw error;
      throw new CtfdTransportError("DNS_FAILED", "CTFd hostname resolution failed");
    } finally { clearTimeout(timerHandle); }
    if (!Array.isArray(records) || records.length === 0 || records.length > 32) throw new CtfdTransportError("DNS_INVALID", "CTFd DNS returned no usable addresses");
    const normalized = records.map((record) => {
      if (!record || typeof record.address !== "string") throw new CtfdTransportError("DNS_INVALID", "CTFd DNS returned an invalid address");
      const family = net.isIP(record.address);
      if (!family || (record.family !== undefined && Number(record.family) !== family)) throw new CtfdTransportError("DNS_INVALID", "CTFd DNS address family was invalid");
      if (!this.#allowedAddresses.has(record.address)) throw new CtfdTransportError("DNS_DENIED", "CTFd DNS answer was outside the configured IP allowlist");
      return { address: record.address, family };
    });
    return normalized[0];
  }

  async #request({ method, pathname, body = null, maxBytes, attachment = false }) {
    let url;
    try { url = new URL(pathname, this.#base); } catch { throw new CtfdTransportError("URL_INVALID", "CTFd request path is invalid"); }
    if (url.origin !== this.#base.origin || url.username || url.password || url.hash || (!attachment && url.search)) {
      throw new CtfdTransportError("URL_DENIED", "CTFd request escaped the configured origin or API route policy");
    }
    if (attachment) validateAttachmentLocation(this.#base, url.href);
    else if (!new Set(["/api/v1/challenges", "/api/v1/challenges/attempt"]).has(url.pathname) && !/^\/api\/v1\/challenges\/\d{1,12}\/files$/.test(url.pathname)) {
      throw new CtfdTransportError("ROUTE_DENIED", "CTFd API route is not allowlisted");
    }
    const pinned = await this.#resolvePinnedAddress();
    const bodyBytes = body === null ? null : Buffer.from(JSON.stringify(body));
    if (bodyBytes && bodyBytes.length > 8192) throw new CtfdTransportError("REQUEST_TOO_LARGE", "CTFd request exceeded the configured body limit");

    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => { if (settled) return; settled = true; clearTimeout(timer); fn(value); };
      const timer = setTimeout(() => {
        request.destroy();
        finish(reject, new CtfdTransportError("REQUEST_TIMEOUT", "CTFd request timed out"));
      }, this.#timeoutMs);
      const lookup = (_host, options, callback) => {
        const item = { address: pinned.address, family: pinned.family };
        if (options?.all) callback(null, [item]); else callback(null, item.address, item.family);
      };
      const headers = {
        Authorization: `Token ${this.#token}`,
        Accept: attachment ? "application/octet-stream" : "application/json",
        ...(bodyBytes ? { "Content-Type": "application/json", "Content-Length": String(bodyBytes.length) } : {}),
        Connection: "close",
      };
      const request = https.request({
        protocol: "https:",
        hostname: transportHostname(this.#base),
        port: this.#base.port || 443,
        method,
        path: `${url.pathname}${url.search}`,
        headers,
        lookup,
        servername: net.isIP(transportHostname(this.#base)) ? undefined : transportHostname(this.#base),
        rejectUnauthorized: true,
        ca: this.#ca,
        minVersion: "TLSv1.2",
      }, (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.destroy();
          finish(reject, new CtfdTransportError("REDIRECT_DENIED", "CTFd redirects are not followed", status));
          return;
        }
        const contentLength = Number(response.headers["content-length"]);
        if (Number.isFinite(contentLength) && contentLength > maxBytes) {
          response.destroy();
          finish(reject, new CtfdTransportError("RESPONSE_TOO_LARGE", "CTFd response exceeded the configured size limit", status));
          return;
        }
        const chunks = [];
        let total = 0;
        response.on("data", (chunk) => {
          total += chunk.length;
          if (total > maxBytes) {
            response.destroy();
            finish(reject, new CtfdTransportError("RESPONSE_TOO_LARGE", "CTFd response exceeded the configured size limit", status));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () => finish(resolve, {
          status,
          headers: { retryAfter: response.headers["retry-after"] ?? null, contentType: response.headers["content-type"] ?? null },
          body: Buffer.concat(chunks),
        }));
        response.on("error", () => finish(reject, new CtfdTransportError("RESPONSE_FAILED", "CTFd response stream failed", status)));
      });
      request.on("error", () => finish(reject, new CtfdTransportError("REQUEST_FAILED", "CTFd connection or TLS validation failed")));
      if (bodyBytes) request.write(bodyBytes);
      request.end();
    });
  }

  async #getJson(pathname) {
    const result = await this.#request({ method: "GET", pathname, maxBytes: this.#maxJsonBytes });
    if (result.status < 200 || result.status >= 300) throw new CtfdTransportError("HTTP_STATUS", `CTFd returned HTTP ${result.status}`, result.status);
    return parseJson(result.body);
  }

  async fetchSnapshot() {
    const started = performance.now();
    const assertWithinSnapshotBudget = () => {
      if (performance.now() - started > this.#snapshotTimeoutMs) throw new CtfdTransportError("SNAPSHOT_TIMEOUT", "CTFd snapshot exceeded its configured wall-time budget");
    };
    assertWithinSnapshotBudget();
    const response = await this.#getJson("/api/v1/challenges");
    const challenges = validateApiList(response, "challenge list");
    if (challenges.length > this.#maxChallenges) throw new CtfdTransportError("CHALLENGE_LIMIT", "CTFd challenge list exceeded the configured item limit");
    const seenChallengeIds = new Set();
    const attachmentsByChallengeId = {};
    const downloads = {};
    let totalAttachmentBytes = 0;
    let attachmentCount = 0;

    for (const challenge of challenges) {
      assertWithinSnapshotBudget();
      const id = safeChallengeId(challenge?.id);
      if (seenChallengeIds.has(id)) throw new CtfdTransportError("SCHEMA_MISMATCH", "CTFd challenge list contains duplicate IDs");
      seenChallengeIds.add(id);
      if (typeof challenge.name !== "string" || typeof challenge.description !== "string" || typeof challenge.category !== "string") throw new CtfdTransportError("SCHEMA_MISMATCH", "CTFd challenge metadata is missing required string fields");
      if (challenge.state && challenge.state !== "visible") continue;
      const filesResponse = await this.#getJson(`/api/v1/challenges/${id}/files`);
      const files = validateApiList(filesResponse, `challenge ${id} files`);
      attachmentsByChallengeId[id] = [];
      const seenFileIds = new Set();
      for (const file of files) {
        assertWithinSnapshotBudget();
        attachmentCount++;
        if (attachmentCount > this.#maxAttachments) throw new CtfdTransportError("ATTACHMENT_LIMIT", "CTFd attachment count exceeded the configured item limit");
        const fileId = safeChallengeId(file?.id);
        if (seenFileIds.has(fileId)) throw new CtfdTransportError("SCHEMA_MISMATCH", `CTFd challenge ${id} has duplicate attachment IDs`);
        seenFileIds.add(fileId);
        const location = validateAttachmentLocation(this.#base, file?.location);
        const name = typeof file.name === "string" && file.name.length ? file.name : filenameFromLocation(location);
        const body = await this.#request({ method: "GET", pathname: `${location.pathname}${location.search}`, maxBytes: this.#maxAttachmentBytes, attachment: true });
        if (body.status < 200 || body.status >= 300) throw new CtfdTransportError("ATTACHMENT_HTTP_STATUS", `CTFd attachment request returned HTTP ${body.status}`, body.status);
        totalAttachmentBytes += body.body.length;
        if (totalAttachmentBytes > this.#maxTotalAttachmentBytes) throw new CtfdTransportError("ATTACHMENT_TOTAL_LIMIT", "CTFd downloads exceeded the configured total byte limit");
        const prior = downloads[fileId];
        const encoded = body.body.toString("base64");
        if (prior && prior !== encoded) throw new CtfdTransportError("SCHEMA_MISMATCH", "CTFd reused an attachment ID for different bytes");
        downloads[fileId] = encoded;
        attachmentsByChallengeId[id].push({
          id: fileId,
          name,
          location: location.pathname, // Never pass signed URL query tokens into the offline intake.
          ...(typeof file.sha1sum === "string" ? { sha1sum: file.sha1sum } : {}),
        });
      }
    }
    return {
      baseUrl: this.#base.origin,
      response,
      attachmentsByChallengeId,
      downloads,
      timing: { elapsed_ms: performance.now() - started, challenge_count: challenges.length, attachment_count: attachmentCount, attachment_bytes: totalAttachmentBytes },
    };
  }

  #loadJournal() {
    if (!this.#journalPath) throw new CtfdTransportError("SUBMISSION_DISABLED", "CTFd submission journal is not configured");
    safeJournalParent(this.#journalPath);
    if (!fs.existsSync(this.#journalPath)) return { version: 1, origin: this.#base.origin, challenges: {} };
    let state;
    try { state = JSON.parse(fs.readFileSync(this.#journalPath, "utf8")); }
    catch { throw new CtfdTransportError("JOURNAL_INVALID", "CTFd submission journal could not be read"); }
    if (state.version !== 1 || state.origin !== this.#base.origin || !state.challenges || typeof state.challenges !== "object") throw new CtfdTransportError("JOURNAL_INVALID", "CTFd submission journal schema or origin did not match");
    return state;
  }

  async submitFlag({ challengeId, candidate }) {
    if (!this.#submissionEnabled) throw new CtfdTransportError("SUBMISSION_DISABLED", "CTFd submission is disabled by default");
    const id = safeChallengeId(challengeId);
    if (typeof candidate !== "string" || candidate.length < 1 || Buffer.byteLength(candidate, "utf8") > 4096 || /[\0\r\n]/.test(candidate)) throw new Error("CTFd candidate must be a bounded single-line string");
    if (this.#inFlightByChallenge.has(id)) return { status: "submission_in_progress", latency_ms: 0 };
    const run = this.#submitFlagOnce(id, candidate);
    this.#inFlightByChallenge.set(id, run);
    try { return await run; }
    finally { this.#inFlightByChallenge.delete(id); }
  }

  async #submitFlagOnce(id, candidate) {
    const lock = acquireJournalLock(this.#journalPath);
    if (!lock.acquired) return { status: "submission_in_progress", latency_ms: 0 };
    try { return await this.#submitFlagLocked(id, candidate); }
    finally { lock.release(); }
  }

  async #submitFlagLocked(id, candidate) {
    const candidateHash = crypto.createHash("sha256").update(candidate, "utf8").digest("hex");
    const now = Date.now();
    const journal = this.#loadJournal();
    const entry = journal.challenges[id] ?? { attempts: [], nextAllowedAt: 0 };
    if (entry.attempts.some((attempt) => attempt.candidate_sha256 === candidateHash)) return { status: "duplicate_suppressed", latency_ms: 0 };
    if (entry.attempts.length >= this.#maxSubmissionAttempts) return { status: "local_attempt_limit", latency_ms: 0 };
    if (now < (entry.nextAllowedAt ?? 0)) return { status: "local_rate_limited", retry_after_ms: entry.nextAllowedAt - now, latency_ms: 0 };

    const attempt = { candidate_sha256: candidateHash, status: "pending", attempted_at: new Date(now).toISOString() };
    entry.attempts.push(attempt);
    entry.nextAllowedAt = now + this.#minimumSubmissionIntervalMs;
    journal.challenges[id] = entry;
    atomicWrite(this.#journalPath, journal); // Durable before transmission; pending means outcome may be uncertain after a crash.

    const started = performance.now();
    let response;
    try {
      response = await this.#request({ method: "POST", pathname: "/api/v1/challenges/attempt", body: { challenge_id: Number(id), submission: candidate }, maxBytes: 32 * 1024 });
    } catch (error) {
      attempt.status = "uncertain";
      attempt.completed_at = new Date().toISOString();
      atomicWrite(this.#journalPath, journal);
      if (error instanceof CtfdTransportError) throw error;
      throw new CtfdTransportError("SUBMISSION_UNCERTAIN", "CTFd submission outcome is uncertain; the candidate will not be resent automatically");
    }

    let body = null;
    if (response.body.length) {
      try { body = JSON.parse(response.body.toString("utf8")); }
      catch { body = null; }
    }
    const rawStatus = body?.data?.status;
    // CTFd's built-in API maps legacy plugin tuple results directly to booleans;
    // newer ChallengeResponse implementations return a status string.
    const apiStatus = typeof rawStatus === "boolean" ? (rawStatus ? "correct" : "incorrect") : rawStatus;
    let status = typeof apiStatus === "string" && CTFD_ATTEMPT_STATUSES.has(apiStatus) ? apiStatus : null;
    if (response.status === 429) status = "ratelimited";
    if (!status || (response.status < 200 || response.status >= 300) && ![403, 429].includes(response.status)) {
      attempt.status = "uncertain";
      attempt.completed_at = new Date().toISOString();
      atomicWrite(this.#journalPath, journal);
      throw new CtfdTransportError("SUBMISSION_RESPONSE_UNKNOWN", "CTFd returned an unrecognized submission result; duplicate retry suppressed", response.status);
    }

    const finishedAt = Date.now();
    attempt.status = status;
    attempt.http_status = response.status;
    attempt.completed_at = new Date(finishedAt).toISOString();
    if (status === "ratelimited") {
      const waitMs = Math.max(this.#minimumSubmissionIntervalMs, retryAfterMs(response.headers.retryAfter, finishedAt));
      entry.nextAllowedAt = finishedAt + waitMs;
    }
    atomicWrite(this.#journalPath, journal);
    return { status, http_status: response.status, retry_after_ms: status === "ratelimited" ? Math.max(0, entry.nextAllowedAt - finishedAt) : 0, latency_ms: performance.now() - started };
  }
}

/**
 * Controller orchestration: fetch a bounded snapshot, hand only the normalized
 * artifact workspace to the injected solver, verify locally, and submit only
 * verified candidates when both the client and this call explicitly opt in.
 */
export async function runCtfdTransportCycle({ client, projectRoot, intakeRoot, stateFile, verifierDigests, executeSolver, submitVerifiedCandidates = false }) {
  if (!(client instanceof CtfdTransportClient)) throw new Error("a controller-owned CtfdTransportClient is required");
  if (typeof executeSolver !== "function") throw new Error("an explicit solver executor is required");
  if (typeof submitVerifiedCandidates !== "boolean") throw new Error("submitVerifiedCandidates must be boolean");
  if (submitVerifiedCandidates && !client.submissionEnabled) throw new CtfdTransportError("SUBMISSION_DISABLED", "explicit submission requested but client submission is disabled");

  const snapshot = await client.fetchSnapshot();
  const candidates = new Map();
  const cycle = await runCtfdMockCycle({
    projectRoot,
    ...snapshot,
    intakeRoot,
    stateFile,
    verifierDigests,
    simulateSubmission: false,
    executeSolver: async (input) => {
      const result = await executeSolver(input);
      if (typeof result?.candidate === "string") candidates.set(String(input.challenge.platform.id), result.candidate);
      return result;
    },
  });
  const submissions = [];
  if (submitVerifiedCandidates) {
    for (const challenge of cycle.challenges) {
      if (!challenge.verified) continue;
      const platformId = String(challenge.challenge_id ?? "").replace(/^ctfd-/, "");
      const candidate = candidates.get(platformId);
      if (typeof candidate !== "string") continue;
      submissions.push({ platform_id: platformId, ...(await client.submitFlag({ challengeId: platformId, candidate })) });
    }
  }
  return { ...cycle, transport: snapshot.timing, submissions };
}

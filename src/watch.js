import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { loadChallenge } from "./challenge.js";
import { assertChallengeArtifacts } from "./artifacts.js";
import { assertChallengeServiceFiles } from "./service.js";
import { loadPolicy } from "./config.js";
import { runChallengeWithRetry, spawnSolve } from "./race.js";

const SKIP_DIRS = new Set([".git", "node_modules", "runs"]);

function safe(value) {
  return String(value ?? "watch").replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
}

function walk(root, out) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    if (fs.existsSync(path.join(full, "challenge.json"))) {
      out.push(full);
      continue;
    }
    walk(full, out);
  }
}

export function ensureWatchRoot(intakeRoot) {
  const root = path.resolve(intakeRoot);
  fs.mkdirSync(root, { recursive: true });
  return root;
}

export function watchStatePath(projectRoot, intakeRoot) {
  const root = path.resolve(intakeRoot);
  const base = safe(path.basename(root) || "intake");
  const hash = crypto.createHash("sha256").update(root).digest("hex").slice(0, 10);
  return path.join(projectRoot, "runs", "_watch", `${base}-${hash}.json`);
}

export function scanWatchRoot(intakeRoot) {
  const root = path.resolve(intakeRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error("watch root must be an existing directory: " + root);
  }

  const dirs = [];
  if (fs.existsSync(path.join(root, "challenge.json"))) dirs.push(root);
  else walk(root, dirs);

  const entries = [];
  const seen = new Map();

  for (const sourceDir of dirs.sort()) {
    let challenge;
    try {
      challenge = loadChallenge(sourceDir);
    } catch (error) {
      entries.push({
        source_dir: sourceDir,
        challenge_id: null,
        title: path.basename(sourceDir),
        category: "unknown",
        ready: false,
        waiting_reason: error instanceof Error ? error.message : String(error),
        service_port: null,
      });
      continue;
    }

    if (seen.has(challenge.id)) {
      throw new Error(
        `duplicate challenge id ${challenge.id}: ${seen.get(challenge.id)} and ${sourceDir}`
      );
    }
    seen.set(challenge.id, sourceDir);

    let ready = true;
    let waitingReason = null;
    try {
      assertChallengeArtifacts(sourceDir, challenge);
      assertChallengeServiceFiles(sourceDir, challenge);
    } catch (error) {
      ready = false;
      waitingReason = error instanceof Error ? error.message : String(error);
    }

    entries.push({
      source_dir: sourceDir,
      challenge_id: challenge.id,
      title: challenge.title,
      category: challenge.category ?? "unknown",
      ready,
      waiting_reason: waitingReason,
      service_port: Number.isInteger(challenge.service?.local_port)
        ? challenge.service.local_port
        : null,
      challenge,
    });
  }

  return { root, entries };
}

function newState(root) {
  return {
    version: 1,
    intake_root: root,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    challenges: {},
  };
}

function loadState(projectRoot, intakeRoot) {
  const file = watchStatePath(projectRoot, intakeRoot);
  if (!fs.existsSync(file)) return { file, state: newState(path.resolve(intakeRoot)) };
  const state = JSON.parse(fs.readFileSync(file, "utf8"));
  state.challenges ??= {};
  return { file, state };
}

function persist(file, state) {
  state.updated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state, null, 2) + "\n");
}

function publicEntry(entry) {
  return {
    challenge_id: entry.challenge_id,
    title: entry.title,
    category: entry.category,
    source_dir: entry.source_dir,
    service_port: entry.service_port,
  };
}

function syncDiscovered(state, scan) {
  let changed = false;

  for (const found of scan.entries) {
    if (!found.challenge_id) continue;
    const id = found.challenge_id;
    const current = state.challenges[id];

    if (!current) {
      state.challenges[id] = {
        ...publicEntry(found),
        status: found.ready ? "queued" : "waiting",
        waiting_reason: found.waiting_reason,
        discovered_at: new Date().toISOString(),
        attempts: [],
      };
      changed = true;
      continue;
    }

    if (path.resolve(current.source_dir) !== path.resolve(found.source_dir)) {
      throw new Error(
        `challenge id ${id} moved/conflicted: ${current.source_dir} vs ${found.source_dir}`
      );
    }

    current.title = found.title;
    current.category = found.category;
    current.service_port = found.service_port;

    if (current.status === "waiting") {
      const next = found.ready ? "queued" : "waiting";
      if (next !== current.status || current.waiting_reason !== found.waiting_reason) changed = true;
      current.status = next;
      current.waiting_reason = found.waiting_reason;
      if (found.ready) current.ready_at = new Date().toISOString();
    }
  }

  return changed;
}

export function readWatchStatus(projectRoot, intakeRoot) {
  const { file, state } = loadState(projectRoot, intakeRoot);
  const counts = {};
  const challenges = Object.values(state.challenges)
    .sort((a, b) => String(a.discovered_at).localeCompare(String(b.discovered_at)))
    .map((item) => {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
      return item;
    });
  return { state_file: file, intake_root: state.intake_root, counts, challenges };
}

export async function runWatch({
  projectRoot,
  intakeRoot,
  concurrency,
  freshRetries,
  pollMs,
  idleExitMs = null,
  executeAttempt = null,
  signal = null,
}) {
  const policy = loadPolicy(projectRoot);
  const limit = concurrency ?? policy.competition_concurrency ?? 5;
  const retries = freshRetries ?? policy.fresh_retry_attempts ?? 1;
  const interval = pollMs ?? policy.watch_poll_ms ?? 1000;

  if (!Number.isInteger(limit) || limit < 1 || limit > 32) {
    throw new Error("watch concurrency must be an integer from 1 to 32");
  }
  if (!Number.isInteger(retries) || retries < 0 || retries > 3) {
    throw new Error("watch fresh retries must be an integer from 0 to 3");
  }
  if (!Number.isInteger(interval) || interval < 100 || interval > 60000) {
    throw new Error("watch poll interval must be an integer from 100 to 60000 ms");
  }
  if (idleExitMs !== null && (!Number.isInteger(idleExitMs) || idleExitMs < 100)) {
    throw new Error("idle exit must be null or an integer >= 100 ms");
  }

  const ensuredRoot = ensureWatchRoot(intakeRoot);
  const initial = scanWatchRoot(ensuredRoot);
  const { file: stateFile, state } = loadState(projectRoot, initial.root);
  const active = new Map();
  const activePorts = new Set();
  let lastActivity = Date.now();
  let stopping = false;

  const abort = () => { stopping = true; };
  signal?.addEventListener?.("abort", abort, { once: true });

  console.log(
    `[ctf-racer] watch: root=${initial.root} concurrency=${limit} fresh_retries=${retries} poll_ms=${interval}`
  );
  console.log(`[ctf-racer] watch state: ${stateFile}`);

  async function launch(item) {
    item.status = "running";
    item.started_at = new Date().toISOString();
    item.waiting_reason = null;
    persist(stateFile, state);
    lastActivity = Date.now();

    if (Number.isInteger(item.service_port)) activePorts.add(item.service_port);

    const task = (async () => {
      const sourceDir = item.source_dir;
      const challenge = loadChallenge(sourceDir);
      const base = {
        path: sourceDir,
        category: item.category,
        challenge_id: item.challenge_id,
        title: item.title,
      };

      try {
        const result = await runChallengeWithRetry({
          entry: base,
          freshRetries: retries,
          executeAttempt: async (_entry, attempt) => {
            if (executeAttempt) {
              return executeAttempt({ ...base, sourceDir, challenge }, attempt);
            }
            return spawnSolve({ projectRoot, sourceDir, challenge, attempt });
          },
        });

        item.attempts = result.attempts;
        item.status = result.verified ? "solved" : "failed";
        item.verified = result.verified;
        item.winning_attempt = result.winning_attempt;
        item.finished_at = new Date().toISOString();
        console.log(
          `[watch][${safe(item.challenge_id)}] complete status=${item.status} attempts=${item.attempts.length}`
        );
      } catch (error) {
        item.status = "failed";
        item.verified = false;
        item.error = error instanceof Error ? error.message : String(error);
        item.finished_at = new Date().toISOString();
        console.error(`[watch][${safe(item.challenge_id)}] failed: ${item.error}`);
      } finally {
        if (Number.isInteger(item.service_port)) activePorts.delete(item.service_port);
        active.delete(item.challenge_id);
        persist(stateFile, state);
        lastActivity = Date.now();
      }
    })();

    active.set(item.challenge_id, task);
  }

  try {
    while (true) {
      const scan = scanWatchRoot(initial.root);
      if (syncDiscovered(state, scan)) {
        persist(stateFile, state);
        lastActivity = Date.now();
      }

      while (active.size < limit) {
        const next = Object.values(state.challenges)
          .filter((item) => item.status === "queued")
          .sort((a, b) => String(a.discovered_at).localeCompare(String(b.discovered_at)))
          .find((item) => !Number.isInteger(item.service_port) || !activePorts.has(item.service_port));

        if (!next) break;
        console.log(
          `[watch][${safe(next.challenge_id)}] dispatch category=${next.category} active=${active.size + 1}/${limit}`
        );
        await launch(next);
      }

      persist(stateFile, state);

      if (stopping && active.size === 0) break;
      if (
        idleExitMs !== null &&
        active.size === 0 &&
        Date.now() - lastActivity >= idleExitMs
      ) break;

      await new Promise((resolve) => setTimeout(resolve, interval));
    }
  } finally {
    signal?.removeEventListener?.("abort", abort);
    await Promise.allSettled([...active.values()]);
    persist(stateFile, state);
  }

  return readWatchStatus(projectRoot, initial.root);
}

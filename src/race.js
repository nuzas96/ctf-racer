import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { loadChallenge, safeChallengeId } from "./challenge.js";
import { loadPolicy } from "./config.js";
import { precheckSuite } from "./suite.js";
import { solverEnvironment } from "./solver-env.js";

function safeId(value) {
  return String(value ?? "challenge").replace(/[^a-zA-Z0-9._-]/g, "-");
}

export async function runConcurrent(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("concurrency must be >= 1");
  const results = new Array(items.length);
  let cursor = 0;

  async function consume() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => consume()));
  return results;
}

export async function runChallengeWithRetry({ entry, freshRetries, executeAttempt }) {
  const attempts = [];
  const maxAttempts = 1 + freshRetries;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await executeAttempt(entry, attempt);
    attempts.push(result);
    if (result.status === "solved" && result.flag_verified === true) {
      return {
        ...entry,
        status: "solved",
        verified: true,
        winning_attempt: attempt,
        attempts,
      };
    }
  }

  const last = attempts[attempts.length - 1] ?? {};
  return {
    ...entry,
    status: last.status ?? "error",
    verified: false,
    winning_attempt: null,
    attempts,
  };
}

function prefixPipe(stream, write, label) {
  let pending = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    pending += chunk;
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) write(`[race][${label}] ${line}\n`);
  });
  stream.on("end", () => {
    if (pending) write(`[race][${label}] ${pending}\n`);
  });
}

function compactState(state, exitCode, attempt, attemptId) {
  return {
    attempt,
    attempt_id: attemptId,
    status: state.status ?? "unknown",
    flag_verified: state.flag_verified === true,
    elapsed_ms: state.elapsed_ms ?? null,
    rounds: state.rounds ?? 0,
    stall_count: state.stall_count ?? 0,
    rejected_candidates: state.rejected_candidates?.length ?? 0,
    skill_proof_verified: state.skill_proof?.verified === true,
    focused_reference_status: state.skill_proof?.reference_status ?? "unknown",
    focused_reference_count: state.skill_proof?.references?.length ?? 0,
    terminal_reason: state.terminal_reason ?? null,
    exit_code: exitCode,
    runtime_metadata: state.runtime_metadata ?? null,
  };
}

function rejectedAttempt({ attempt, attemptId, exitCode, elapsedMs, error }) {
  return {
    attempt,
    attempt_id: attemptId,
    status: "error",
    flag_verified: false,
    elapsed_ms: elapsedMs,
    rounds: 0,
    stall_count: 0,
    rejected_candidates: 0,
    skill_proof_verified: false,
    focused_reference_status: "unknown",
    focused_reference_count: 0,
    terminal_reason: null,
    exit_code: exitCode,
    runtime_metadata: null,
    error,
  };
}

function validateRaceRunDirectories(projectRoot, entries) {
  const seen = new Map();
  for (const entry of entries) {
    const sourceDir = path.resolve(projectRoot, entry.path);
    const challenge = loadChallenge(sourceDir);
    const runDirectory = safeChallengeId(challenge.id);
    const previous = seen.get(runDirectory);
    if (previous) {
      throw new Error(
        `race suite has run-directory collision: challenge IDs ${JSON.stringify(previous.challengeId)} (${JSON.stringify(previous.path)}) and ${JSON.stringify(challenge.id)} (${JSON.stringify(entry.path)}) both resolve to runs/${runDirectory}`
      );
    }
    seen.set(runDirectory, { challengeId: challenge.id, path: entry.path });
  }
}

export async function spawnSolve({ projectRoot, sourceDir, challenge, attempt }) {
  const cliPath = path.join(projectRoot, "src", "cli.js");
  const challengeId = safeChallengeId(challenge.id);
  const statePath = path.join(projectRoot, "runs", challengeId, "state.json");
  const startedMs = Date.now();
  const attemptId = randomUUID();
  const label = `${safeId(challenge.id)}#${attempt}`;

  console.log(`[race][${label}] starting fresh solver`);

  const childEnv = solverEnvironment(process.env);
  delete childEnv.CTF_RACER_BENCHMARK_ATTEMPT_ID;
  childEnv.CTF_RACER_ATTEMPT_ID = attemptId;

  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cliPath, "solve", sourceDir], {
      cwd: projectRoot,
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    prefixPipe(child.stdout, (line) => process.stdout.write(line), label);
    prefixPipe(child.stderr, (line) => process.stderr.write(line), label);
    child.once("error", reject);
    child.once("close", (code) => resolve(code ?? 1));
  });

  if (!fs.existsSync(statePath)) {
    return rejectedAttempt({ attempt, attemptId, exitCode, elapsedMs: Date.now() - startedMs, error: "solver produced no state file for this attempt" });
  }

  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return rejectedAttempt({ attempt, attemptId, exitCode, elapsedMs: Date.now() - startedMs, error: "solver state is unreadable" });
  }

  if (!state || typeof state !== "object" || Array.isArray(state) ||
      state.attempt_id !== attemptId || state.runtime_metadata?.attempt_id !== attemptId) {
    return rejectedAttempt({ attempt, attemptId, exitCode, elapsedMs: Date.now() - startedMs, error: "solver state attempt ID mismatch" });
  }

  return compactState(state, exitCode, attempt, attemptId);
}

function validateRacePorts(projectRoot, entries) {
  const seen = new Map();
  for (const entry of entries) {
    const sourceDir = path.resolve(projectRoot, entry.path);
    const challenge = loadChallenge(sourceDir);
    const port = challenge.service?.local_port;
    if (!Number.isInteger(port)) continue;
    if (seen.has(port)) {
      throw new Error(
        `race suite has conflicting local service port ${port}: ${seen.get(port)} and ${entry.path}`
      );
    }
    seen.set(port, entry.path);
  }
}

export async function runRace({
  projectRoot,
  suitePath,
  concurrency,
  freshRetries,
  executeAttempt = null,
}) {
  const check = precheckSuite(projectRoot, suitePath);
  const blocking = check.entries.filter((entry) => entry.required && entry.artifact_status !== "ok");
  if (blocking.length) {
    throw new Error(
      "race precheck failed before model calls: " +
      blocking.map((entry) => `${entry.path} (${entry.error})`).join("; ")
    );
  }

  const policy = loadPolicy(projectRoot);
  const resolvedConcurrency = concurrency ?? policy.competition_concurrency ?? 5;
  const resolvedRetries = freshRetries ?? policy.fresh_retry_attempts ?? 1;

  if (!Number.isInteger(resolvedConcurrency) || resolvedConcurrency < 1 || resolvedConcurrency > 32) {
    throw new Error("race concurrency must be an integer from 1 to 32");
  }
  if (!Number.isInteger(resolvedRetries) || resolvedRetries < 0 || resolvedRetries > 3) {
    throw new Error("fresh retries must be an integer from 0 to 3");
  }

  validateRaceRunDirectories(projectRoot, check.entries);
  const entries = check.entries.filter((entry) => entry.artifact_status === "ok");
  validateRacePorts(projectRoot, entries);

  const startedMs = Date.now();
  console.log(
    `[ctf-racer] race: ${check.suite.id} challenges=${entries.length} concurrency=${resolvedConcurrency} fresh_retries=${resolvedRetries}`
  );

  const challengeResults = await runConcurrent(entries, resolvedConcurrency, async (entry) => {
    const sourceDir = path.resolve(projectRoot, entry.path);
    const challenge = loadChallenge(sourceDir);
    const base = {
      path: entry.path,
      category: entry.category ?? challenge.category ?? "unknown",
      challenge_id: challenge.id,
      title: challenge.title,
    };

    const result = await runChallengeWithRetry({
      entry: base,
      freshRetries: resolvedRetries,
      executeAttempt: async (_entry, attempt) => {
        if (executeAttempt) return executeAttempt({ ...base, sourceDir, challenge }, attempt);
        return spawnSolve({ projectRoot, sourceDir, challenge, attempt });
      },
    });

    console.log(
      `[race][${safeId(challenge.id)}] complete verified=${result.verified} attempts=${result.attempts.length}`
    );
    return result;
  });

  const finishedMs = Date.now();
  const verifiedChallenges = challengeResults.filter((item) => item.verified).length;
  const totalAttempts = challengeResults.reduce((sum, item) => sum + item.attempts.length, 0);

  const report = {
    race_id: check.suite.id,
    suite_description: check.suite.description ?? null,
    created_at: new Date(finishedMs).toISOString(),
    wall_elapsed_ms: finishedMs - startedMs,
    concurrency: resolvedConcurrency,
    fresh_retries: resolvedRetries,
    total_challenges: challengeResults.length,
    verified_challenges: verifiedChallenges,
    verified_challenge_rate: challengeResults.length ? verifiedChallenges / challengeResults.length : 0,
    total_attempts: totalAttempts,
    challenges: challengeResults,
  };

  const safeSuiteId = safeId(check.suite.id ?? "race");
  const stamp = new Date(finishedMs).toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(projectRoot, "runs", "_races", safeSuiteId);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, stamp + ".json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");

  return { ...report, output_path: outputPath };
}

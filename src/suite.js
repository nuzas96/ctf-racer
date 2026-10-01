import fs from "node:fs";
import path from "node:path";
import { loadChallenge } from "./challenge.js";
import { assertChallengeArtifacts, fetchChallengeArtifacts } from "./artifacts.js";
import { runBenchmark } from "./benchmark.js";

export function loadSuite(projectRoot, suitePath) {
  const full = path.resolve(projectRoot, suitePath);
  if (!fs.existsSync(full)) throw new Error("suite file not found: " + full);
  const suite = JSON.parse(fs.readFileSync(full, "utf8"));
  if (!Array.isArray(suite.benchmarks) || suite.benchmarks.length === 0) {
    throw new Error("suite must contain at least one benchmark");
  }
  return { suite, full };
}

export function precheckSuite(projectRoot, suitePath) {
  const loaded = loadSuite(projectRoot, suitePath);
  const entries = loaded.suite.benchmarks.map((entry) => {
    const sourceDir = path.resolve(projectRoot, entry.path);
    const challenge = loadChallenge(sourceDir);
    let artifactStatus = "ok";
    let error = null;
    try {
      assertChallengeArtifacts(sourceDir, challenge);
    } catch (err) {
      artifactStatus = "error";
      error = err instanceof Error ? err.message : String(err);
    }
    return {
      path: entry.path,
      category: entry.category ?? challenge.category ?? "unknown",
      required: entry.required !== false,
      artifact_status: artifactStatus,
      error,
    };
  });

  return { suite: loaded.suite, suitePath: loaded.full, entries };
}

export function runSuite({ projectRoot, suitePath, runs = 1 }) {
  const check = precheckSuite(projectRoot, suitePath);
  const blocking = check.entries.filter((entry) => entry.required && entry.artifact_status !== "ok");
  if (blocking.length > 0) {
    throw new Error(
      "suite precheck failed before model calls: " +
      blocking.map((entry) => entry.path + " (" + entry.error + ")").join("; ")
    );
  }

  const results = [];
  for (const entry of check.entries) {
    if (entry.artifact_status !== "ok") continue;
    const sourceDir = path.resolve(projectRoot, entry.path);
    const result = runBenchmark({ projectRoot, sourceDir, runs });
    results.push({
      path: entry.path,
      category: entry.category,
      report_path: result.outputPath,
      summary: result.report.summary,
    });
  }

  const totalAttempts = results.reduce((sum, item) => sum + item.summary.total_runs, 0);
  const verifiedSolves = results.reduce((sum, item) => sum + item.summary.verified_solves, 0);

  const report = {
    suite_id: check.suite.id,
    suite_description: check.suite.description ?? null,
    created_at: new Date().toISOString(),
    runs_per_benchmark: runs,
    benchmarks: results,
    total_attempts: totalAttempts,
    verified_solves: verifiedSolves,
    verified_solve_rate: totalAttempts ? verifiedSolves / totalAttempts : 0,
  };

  const safeSuiteId = String(check.suite.id ?? "suite").replace(/[^a-zA-Z0-9._-]/g, "-");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outputDir = path.join(projectRoot, "runs", "_suites", safeSuiteId);
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, stamp + ".json");
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2) + "\n");

  return { ...report, output_path: outputPath };
}


export async function fetchSuiteArtifacts(projectRoot, suitePath) {
  const loaded = loadSuite(projectRoot, suitePath);
  const results = [];

  for (const entry of loaded.suite.benchmarks) {
    const sourceDir = path.resolve(projectRoot, entry.path);
    const challenge = loadChallenge(sourceDir);
    const manifest = Array.isArray(challenge.artifact_manifest) ? challenge.artifact_manifest : [];

    if (manifest.length === 0) {
      results.push({ path: entry.path, fetched: 0, status: "no-manifest" });
      continue;
    }

    const missing = manifest.some((item) => {
      const filesDir = path.join(sourceDir, challenge.files_dir ?? "files");
      return !fs.existsSync(path.join(filesDir, String(item.path ?? "")));
    });

    if (!missing) {
      try {
        assertChallengeArtifacts(sourceDir, challenge);
        results.push({ path: entry.path, fetched: 0, status: "already-ok" });
        continue;
      } catch {
        // Re-fetch a corrupted/stale local fixture from the canonical public source.
      }
    }

    const fetched = await fetchChallengeArtifacts(sourceDir, challenge);
    assertChallengeArtifacts(sourceDir, challenge);
    results.push({ path: entry.path, fetched: fetched.length, status: "fetched", artifacts: fetched });
  }

  return { suite_id: loaded.suite.id, results };
}

import fs from "node:fs";
import path from "node:path";
import { loadChallenge } from "./challenge.js";
import { assertChallengeArtifacts } from "./artifacts.js";
import { assertChallengeServiceFiles } from "./service.js";

const SKIP_DIRS = new Set([".git", "node_modules", "runs"]);

function walkChallengeDirs(root, out) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(root, entry.name);
    const challengeFile = path.join(full, "challenge.json");
    if (fs.existsSync(challengeFile)) {
      out.push(full);
      continue;
    }
    walkChallengeDirs(full, out);
  }
}

export function discoverIntakeChallenges(intakeRoot) {
  const root = path.resolve(intakeRoot);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error("intake root must be an existing directory: " + root);
  }

  const dirs = [];
  if (fs.existsSync(path.join(root, "challenge.json"))) dirs.push(root);
  else walkChallengeDirs(root, dirs);

  const seenIds = new Map();
  const entries = dirs.sort().map((sourceDir) => {
    const challenge = loadChallenge(sourceDir);
    if (seenIds.has(challenge.id)) {
      throw new Error(
        `duplicate challenge id ${challenge.id}: ${seenIds.get(challenge.id)} and ${sourceDir}`
      );
    }
    seenIds.set(challenge.id, sourceDir);

    assertChallengeArtifacts(sourceDir, challenge);
    assertChallengeServiceFiles(sourceDir, challenge);

    return {
      path: sourceDir,
      category: challenge.category ?? "unknown",
      required: true,
      challenge_id: challenge.id,
      title: challenge.title,
    };
  });

  if (entries.length === 0) {
    throw new Error("intake contains no challenge.json directories: " + root);
  }

  return { root, entries };
}

export function writeIntakeSuite(projectRoot, intakeRoot, discovered) {
  const base = path.basename(discovered.root) || "intake";
  const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "-");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const id = `intake-${safeBase}-${stamp}`;
  const outputDir = path.join(projectRoot, "runs", "_intake");
  fs.mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, id + ".json");

  const suite = {
    id,
    description: `Generated competition intake from ${path.resolve(intakeRoot)}`,
    generated_from: path.resolve(intakeRoot),
    generated_at: new Date().toISOString(),
    benchmarks: discovered.entries.map((entry) => ({
      path: entry.path,
      category: entry.category,
      required: true,
    })),
  };

  fs.writeFileSync(outputPath, JSON.stringify(suite, null, 2) + "\n");
  return { suite, outputPath };
}

function tailLine(file) {
  if (!fs.existsSync(file)) return null;
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1] : null;
}

export function raceStatus(projectRoot, suitePath) {
  const full = path.resolve(suitePath);
  if (!fs.existsSync(full)) throw new Error("suite/intake manifest not found: " + full);
  const suite = JSON.parse(fs.readFileSync(full, "utf8"));
  if (!Array.isArray(suite.benchmarks)) throw new Error("manifest has no benchmarks array");

  return {
    id: suite.id ?? path.basename(full),
    manifest: full,
    challenges: suite.benchmarks.map((entry) => {
      const sourceDir = path.resolve(projectRoot, entry.path);
      const challenge = loadChallenge(sourceDir);
      const runRoot = path.join(projectRoot, "runs", challenge.id.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-"));
      const stateFile = path.join(runRoot, "state.json");
      const state = fs.existsSync(stateFile)
        ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
        : null;
      return {
        challenge_id: challenge.id,
        title: challenge.title,
        category: entry.category ?? challenge.category ?? "unknown",
        status: state?.status ?? "queued/not-started",
        rounds: state?.rounds ?? 0,
        elapsed_ms: state?.elapsed_ms ?? null,
        stall_count: state?.stall_count ?? 0,
        last_telemetry: tailLine(path.join(runRoot, "telemetry.log")),
      };
    }),
  };
}

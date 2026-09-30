import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

function walk(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (entry.isFile()) files.push(full);
  }
  return files.sort();
}

function digestFiles(files, base) {
  const hash = crypto.createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(base, file));
    hash.update("\0");
    hash.update(fs.readFileSync(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function snapshotProgress(workspace) {
  const progress = path.join(workspace, "PROGRESS.md");
  const legacyFindings = path.join(workspace, "FINDINGS.md");
  const solveDir = path.join(workspace, "solve");
  const files = [];
  if (fs.existsSync(progress)) files.push(progress);
  else if (fs.existsSync(legacyFindings)) files.push(legacyFindings);
  files.push(...walk(solveDir));

  return {
    digest: digestFiles(files, workspace),
    files: files.map((file) => path.relative(workspace, file)),
  };
}

function tokens(text) {
  return new Set(
    String(text ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_{}-]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 3)
  );
}

export function jaccardSimilarity(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 && right.size === 0) return 1;
  if (left.size === 0 || right.size === 0) return 0;

  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function extractProgressMarker(response) {
  return response.match(/^CTF_RACER_PROGRESS=(.+)$/m)?.[1]?.trim() || null;
}

export function extractStalledMarker(response) {
  return response.match(/^CTF_RACER_STALLED=(.+)$/m)?.[1]?.trim() || null;
}

export function evaluateRound({
  before,
  after,
  response,
  previousResponses = [],
  similarityThreshold = 0.82,
}) {
  const workspaceChanged = before.digest !== after.digest;
  const progressMarker = extractProgressMarker(response);
  const stalledMarker = extractStalledMarker(response);

  let maxSimilarity = 0;
  for (const previous of previousResponses) {
    maxSimilarity = Math.max(maxSimilarity, jaccardSimilarity(previous, response));
  }

  const reasons = [];
  if (stalledMarker) reasons.push(`agent-marked-stall: ${stalledMarker}`);
  if (!workspaceChanged && !progressMarker) reasons.push("no workspace evidence or progress marker");
  if (!workspaceChanged && previousResponses.length > 0 && maxSimilarity >= similarityThreshold) {
    reasons.push(`repeated response similarity ${maxSimilarity.toFixed(2)}`);
  }

  return {
    stalled: reasons.length > 0,
    reasons,
    workspaceChanged,
    progressMarker,
    stalledMarker,
    maxSimilarity,
  };
}

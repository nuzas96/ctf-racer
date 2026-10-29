import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const STORAGE_RESERVE_BYTES = 128 * 1024 * 1024;
export const TEMP_RESERVE_BYTES = 128 * 1024 * 1024;

function existingPath(targetPath) {
  let candidate = path.resolve(targetPath);
  while (!fs.existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) throw new Error(`no existing parent for storage path: ${targetPath}`);
    candidate = parent;
  }
  return candidate;
}

export function filesystemSpace(targetPath) {
  const resolved = existingPath(targetPath);
  const { bavail, bsize, blocks } = fs.statfsSync(resolved, { bigint: true });
  return {
    path: resolved,
    total_bytes: Number(blocks * bsize),
    available_bytes: Number(bavail * bsize),
  };
}

export function storagePreflight({ tempPath = os.tmpdir(), workspacePath, artifactBytes = 0,
  tempReserveBytes = TEMP_RESERVE_BYTES, workspaceReserveBytes = STORAGE_RESERVE_BYTES } = {}) {
  if (!workspacePath) throw new Error("workspacePath is required for storage preflight");
  const temp = filesystemSpace(tempPath);
  const workspace = filesystemSpace(workspacePath);
  const workspaceRequired = workspaceReserveBytes + Math.max(0, artifactBytes) * 2;
  const checks = [
    { ...temp, required_bytes: tempReserveBytes, ok: temp.available_bytes >= tempReserveBytes },
    { ...workspace, required_bytes: workspaceRequired, ok: workspace.available_bytes >= workspaceRequired },
  ];
  const byDevice = new Map();
  for (const check of checks) {
    const { dev } = fs.statSync(check.path, { bigint: true });
    const key = String(dev);
    const prior = byDevice.get(key);
    if (!prior || check.required_bytes > prior.required_bytes) byDevice.set(key, check);
  }
  const uniqueChecks = [...byDevice.values()];
  for (const check of uniqueChecks) {
    check.paths = checks.filter((item) => String(fs.statSync(item.path, { bigint: true }).dev) === String(fs.statSync(check.path, { bigint: true }).dev)).map((item) => item.path);
  }
  return { ok: uniqueChecks.every((check) => check.ok), checks: uniqueChecks };
}

export function startStorageMonitor({ workspacePath, intervalMs = 2000, minFreeBytes = STORAGE_RESERVE_BYTES,
  onLowSpace, onSample = () => {} }) {
  let stopped = false;
  let tripped = false;
  const sample = () => {
    if (stopped) return;
    try {
      const checks = [filesystemSpace(os.tmpdir()), filesystemSpace(workspacePath)];
      const byDevice = new Map();
      for (const check of checks) {
        const key = String(fs.statSync(check.path, { bigint: true }).dev);
        if (!byDevice.has(key) || check.available_bytes < byDevice.get(key).available_bytes) byDevice.set(key, check);
      }
      const snapshot = [...byDevice.values()];
      onSample(snapshot);
      const low = snapshot.find((check) => check.available_bytes < minFreeBytes);
      if (low && !tripped) {
        tripped = true;
        onLowSpace?.({ ...low, min_free_bytes: minFreeBytes });
      }
    } catch (error) {
      if (!tripped) {
        tripped = true;
        onLowSpace?.({ error: error.message, min_free_bytes: minFreeBytes });
      }
    }
  };
  const timer = setInterval(sample, intervalMs);
  timer.unref?.();
  sample();
  return { stop() { stopped = true; clearInterval(timer); } };
}

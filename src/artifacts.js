import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function safeArtifactPath(filesDir, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath)) {
    throw new Error("artifact path must be a non-empty relative path");
  }
  const root = path.resolve(filesDir);
  const full = path.resolve(root, relativePath);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("artifact path escapes files directory");
  }
  return full;
}

function sha256File(file) {
  const hash = crypto.createHash("sha256");
  const data = fs.readFileSync(file);
  hash.update(data);
  return hash.digest("hex");
}

export function artifactStatus(sourceDir, challenge) {
  const manifest = Array.isArray(challenge.artifact_manifest) ? challenge.artifact_manifest : [];
  const filesDir = path.join(sourceDir, challenge.files_dir ?? "files");

  return manifest.map((item) => {
    const relativePath = String(item.path ?? "").trim();
    const expectedSha256 = String(item.sha256 ?? "").toLowerCase();
    const expectedSize = Number(item.size);
    let fullPath;
    try {
      fullPath = safeArtifactPath(filesDir, relativePath);
    } catch (error) {
      return {
        path: relativePath,
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    if (!relativePath) {
      return { path: relativePath, ok: false, reason: "missing manifest path" };
    }
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      return { path: relativePath, ok: false, reason: "invalid manifest sha256" };
    }
    if (!Number.isInteger(expectedSize) || expectedSize < 0) {
      return { path: relativePath, ok: false, reason: "invalid manifest size" };
    }
    if (!fs.existsSync(fullPath)) {
      return { path: relativePath, full_path: fullPath, ok: false, reason: "missing" };
    }

    const stat = fs.statSync(fullPath);
    if (!stat.isFile()) {
      return { path: relativePath, full_path: fullPath, ok: false, reason: "not a file" };
    }
    if (stat.size !== expectedSize) {
      return {
        path: relativePath,
        full_path: fullPath,
        ok: false,
        reason: "size mismatch",
        expected_size: expectedSize,
        actual_size: stat.size,
      };
    }

    const actualSha256 = sha256File(fullPath);
    if (actualSha256 !== expectedSha256) {
      return {
        path: relativePath,
        full_path: fullPath,
        ok: false,
        reason: "sha256 mismatch",
        expected_sha256: expectedSha256,
        actual_sha256: actualSha256,
      };
    }

    return {
      path: relativePath,
      full_path: fullPath,
      ok: true,
      size: stat.size,
      sha256: actualSha256,
    };
  });
}

export function assertChallengeArtifacts(sourceDir, challenge) {
  const status = artifactStatus(sourceDir, challenge);
  const failed = status.filter((item) => !item.ok);
  if (failed.length > 0) {
    const detail = failed.map((item) => item.path + ": " + item.reason).join("; ");
    throw new Error("challenge artifact verification failed: " + detail);
  }
  return status;
}

export function importSingleArtifact(sourceDir, challenge, sourcePath) {
  const manifest = Array.isArray(challenge.artifact_manifest) ? challenge.artifact_manifest : [];
  if (manifest.length !== 1) {
    throw new Error("benchmark-import currently requires exactly one artifact_manifest entry");
  }
  if (!fs.existsSync(sourcePath)) {
    throw new Error("artifact source not found: " + sourcePath);
  }

  const item = manifest[0];
  const stat = fs.statSync(sourcePath);
  if (!stat.isFile()) throw new Error("artifact source is not a file: " + sourcePath);

  if (stat.size !== item.size) {
    throw new Error("artifact size mismatch: expected " + item.size + ", got " + stat.size);
  }

  const actualSha256 = sha256File(sourcePath);
  if (actualSha256 !== String(item.sha256).toLowerCase()) {
    throw new Error(
      "artifact SHA-256 mismatch: expected " + item.sha256 + ", got " + actualSha256
    );
  }

  const filesDir = path.join(sourceDir, challenge.files_dir ?? "files");
  const destination = safeArtifactPath(filesDir, String(item.path ?? "").trim());
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(sourcePath, destination);

  return {
    source: sourcePath,
    destination,
    size: stat.size,
    sha256: actualSha256,
  };
}

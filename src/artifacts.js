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

function sha256Buffer(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function gitBlobSha1Buffer(data) {
  const header = Buffer.from("blob " + data.length + "\0", "utf8");
  return crypto.createHash("sha1").update(header).update(data).digest("hex");
}

function gitBlobSha1File(file) {
  return gitBlobSha1Buffer(fs.readFileSync(file));
}

export function artifactStatus(sourceDir, challenge) {
  const manifest = Array.isArray(challenge.artifact_manifest) ? challenge.artifact_manifest : [];
  const filesDir = path.join(sourceDir, challenge.files_dir ?? "files");

  return manifest.map((item) => {
    const relativePath = String(item.path ?? "").trim();
    const expectedSha256 = String(item.sha256 ?? "").toLowerCase();
    const expectedGitBlobSha1 = String(item.git_blob_sha1 ?? "").toLowerCase();
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
    const hasSha256 = /^[a-f0-9]{64}$/.test(expectedSha256);
    const hasGitBlobSha1 = /^[a-f0-9]{40}$/.test(expectedGitBlobSha1);
    if (!hasSha256 && !hasGitBlobSha1) {
      return { path: relativePath, ok: false, reason: "manifest needs sha256 or git_blob_sha1" };
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
    if (hasSha256 && actualSha256 !== expectedSha256) {
      return {
        path: relativePath,
        full_path: fullPath,
        ok: false,
        reason: "sha256 mismatch",
        expected_sha256: expectedSha256,
        actual_sha256: actualSha256,
      };
    }

    const actualGitBlobSha1 = gitBlobSha1File(fullPath);
    if (hasGitBlobSha1 && actualGitBlobSha1 !== expectedGitBlobSha1) {
      return {
        path: relativePath,
        full_path: fullPath,
        ok: false,
        reason: "git blob sha1 mismatch",
        expected_git_blob_sha1: expectedGitBlobSha1,
        actual_git_blob_sha1: actualGitBlobSha1,
      };
    }

    return {
      path: relativePath,
      full_path: fullPath,
      ok: true,
      size: stat.size,
      sha256: actualSha256,
      git_blob_sha1: actualGitBlobSha1,
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


function validateArtifactUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("artifact URL must use https");
  if (url.hostname !== "raw.githubusercontent.com") {
    throw new Error("benchmark-fetch currently allows raw.githubusercontent.com only");
  }
  return url;
}

function verifyDownloadedBuffer(item, data) {
  const expectedSize = Number(item.size);
  if (!Number.isInteger(expectedSize) || expectedSize < 0) {
    throw new Error("invalid manifest size for " + item.path);
  }
  if (data.length !== expectedSize) {
    throw new Error(
      "artifact size mismatch for " + item.path + ": expected " + expectedSize + ", got " + data.length
    );
  }

  const expectedSha256 = String(item.sha256 ?? "").toLowerCase();
  if (expectedSha256) {
    if (!/^[a-f0-9]{64}$/.test(expectedSha256)) {
      throw new Error("invalid manifest sha256 for " + item.path);
    }
    const actual = sha256Buffer(data);
    if (actual !== expectedSha256) {
      throw new Error("artifact SHA-256 mismatch for " + item.path);
    }
  }

  const expectedGitBlobSha1 = String(item.git_blob_sha1 ?? "").toLowerCase();
  if (expectedGitBlobSha1) {
    if (!/^[a-f0-9]{40}$/.test(expectedGitBlobSha1)) {
      throw new Error("invalid manifest git_blob_sha1 for " + item.path);
    }
    const actual = gitBlobSha1Buffer(data);
    if (actual !== expectedGitBlobSha1) {
      throw new Error("artifact Git blob SHA-1 mismatch for " + item.path);
    }
  }

  if (!expectedSha256 && !expectedGitBlobSha1) {
    throw new Error("artifact manifest needs sha256 or git_blob_sha1 for " + item.path);
  }

  return {
    sha256: sha256Buffer(data),
    git_blob_sha1: gitBlobSha1Buffer(data),
  };
}

export async function fetchChallengeArtifacts(sourceDir, challenge) {
  const manifest = Array.isArray(challenge.artifact_manifest) ? challenge.artifact_manifest : [];
  if (manifest.length === 0) return [];

  const filesDir = path.join(sourceDir, challenge.files_dir ?? "files");
  const results = [];

  for (const item of manifest) {
    const relativePath = String(item.path ?? "").trim();
    const rawUrl = String(item.url ?? "").trim();
    if (!rawUrl) throw new Error("missing artifact url for " + relativePath);
    const url = validateArtifactUrl(rawUrl);

    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": "ctf-racer-benchmark-fetch" },
    });
    if (!response.ok) {
      throw new Error("artifact download failed for " + relativePath + ": HTTP " + response.status);
    }

    const data = Buffer.from(await response.arrayBuffer());
    const verified = verifyDownloadedBuffer(item, data);
    const destination = safeArtifactPath(filesDir, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, data);

    results.push({
      path: relativePath,
      destination,
      size: data.length,
      sha256: verified.sha256,
      git_blob_sha1: verified.git_blob_sha1,
      url: url.toString(),
    });
  }

  return results;
}

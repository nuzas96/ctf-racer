import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { STORAGE_RESERVE_BYTES, TEMP_RESERVE_BYTES } from "./storage.js";

function runGit(projectRoot, args) {
  const result = spawnSync("git", ["-C", projectRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 2000,
    maxBuffer: 256 * 1024,
  });
  return result.error || result.status !== 0 ? null : result.stdout.trim();
}

function repositoryMetadata(projectRoot) {
  try {
    const topLevel = runGit(projectRoot, ["rev-parse", "--show-toplevel"]);
    if (!topLevel || fs.realpathSync(topLevel) !== fs.realpathSync(projectRoot)) {
      return { revision: null, dirty: null };
    }

    const revision = runGit(projectRoot, ["rev-parse", "HEAD"]);
    const status = runGit(projectRoot, ["status", "--porcelain=v1", "--untracked-files=normal"]);
    return {
      revision: revision || null,
      dirty: status === null ? null : status.length > 0,
    };
  } catch {
    return { revision: null, dirty: null };
  }
}

function packageVersion(projectRoot, packageName) {
  const packagePath = path.join(projectRoot, "node_modules", ...packageName.split("/"), "package.json");
  try {
    const metadata = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return metadata.name === packageName && typeof metadata.version === "string"
      ? metadata.version
      : null;
  } catch {
    return null;
  }
}

function safeSkillName(value) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]+$/.test(value) && value !== "." && value !== "..";
}

function skillFiles(skillRoot) {
  const files = [];
  const visit = (directory, relative = "") => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "__pycache__" || entry.name.startsWith(".")) continue;
      const childRelative = path.posix.join(relative, entry.name);
      const absolute = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        visit(absolute, childRelative);
      } else if (entry.isFile() && !/\.(?:pyc|pyo|log|tmp|swp)$/i.test(entry.name) && !entry.name.endsWith("~")) {
        files.push({ absolute, relative: childRelative });
      }
    }
  };
  visit(skillRoot);
  return files.sort((a, b) => a.relative.localeCompare(b.relative));
}

function skillsMetadata(skillsRoot) {
  const indexPath = skillsRoot ? path.join(skillsRoot, "ROUTING_INDEX.json") : null;
  let indexBytes;
  try {
    indexBytes = fs.readFileSync(indexPath);
  } catch {
    return {
      status: "missing",
      content_sha256: null,
      routing_index_sha256: null,
      files_hashed: 0,
    };
  }

  const routingIndexSha256 = crypto.createHash("sha256").update(indexBytes).digest("hex");
  let index;
  try {
    index = JSON.parse(indexBytes.toString("utf8"));
  } catch {
    return {
      status: "invalid",
      content_sha256: null,
      routing_index_sha256: routingIndexSha256,
      files_hashed: 0,
    };
  }

  if (!Array.isArray(index.routes)) {
    return {
      status: "invalid",
      content_sha256: null,
      routing_index_sha256: routingIndexSha256,
      files_hashed: 0,
    };
  }

  const names = new Set();
  for (const route of index.routes) {
    if (!route || !safeSkillName(route.primary_skill)) {
      return {
        status: "invalid",
        content_sha256: null,
        routing_index_sha256: routingIndexSha256,
        files_hashed: 0,
      };
    }
    names.add(route.primary_skill);
  }

  const fallbackParts = typeof index.fallback_skill === "string" ? index.fallback_skill.split("/") : [];
  if (fallbackParts.length !== 2 || !safeSkillName(fallbackParts[0]) || fallbackParts[1] !== "SKILL.md") {
    return {
      status: "invalid",
      content_sha256: null,
      routing_index_sha256: routingIndexSha256,
      files_hashed: 0,
    };
  }
  names.add(fallbackParts[0]);

  const contentHash = crypto.createHash("sha256");
  contentHash.update("ctf-racer-skills-v2-content-v1\0");
  let filesHashed = 0;
  try {
    for (const name of [...names].sort()) {
      const skillRoot = path.join(skillsRoot, name);
      const skillFile = path.join(skillRoot, "SKILL.md");
      if (!fs.existsSync(skillRoot) || !fs.statSync(skillRoot).isDirectory() || !fs.existsSync(skillFile) || !fs.statSync(skillFile).isFile()) {
        return {
          status: "mismatched",
          content_sha256: null,
          routing_index_sha256: routingIndexSha256,
          files_hashed: filesHashed,
        };
      }
      contentHash.update(`skill\0${name}\0`);
      const files = skillFiles(skillRoot);
      for (const file of files) {
        contentHash.update(`file\0${name}/${file.relative}\0`);
        contentHash.update(fs.readFileSync(file.absolute));
        contentHash.update("\0");
        filesHashed += 1;
      }
    }
  } catch {
    return {
      status: "unavailable",
      content_sha256: null,
      routing_index_sha256: routingIndexSha256,
      files_hashed: filesHashed,
    };
  }

  return {
    status: "available",
    content_sha256: contentHash.digest("hex"),
    routing_index_sha256: routingIndexSha256,
    files_hashed: filesHashed,
  };
}

export function collectRuntimeMetadata({
  projectRoot,
  skillsRoot = path.join(os.homedir(), ".codex", "skills"),
  attemptId = null,
  activeSkills = [],
  policy = {},
  wallTimeoutSeconds = null,
  sandboxModeOverride = null,
} = {}) {
  const sandboxMode = sandboxModeOverride ?? (Array.isArray(policy.verifier_read_paths) && policy.verifier_read_paths.length > 0
    ? "ctf_racer_isolated"
    : policy.sandbox_mode ?? null);

  return {
    schema_version: 1,
    attempt_id: attemptId,
    repository: repositoryMetadata(projectRoot),
    skills_v2: {
      ...skillsMetadata(skillsRoot),
      active_skills: activeSkills.filter((name) => typeof name === "string"),
    },
    runtime: {
      node_version: process.version,
      codex_sdk_version: packageVersion(projectRoot, "@openai/codex-sdk"),
      codex_runtime_version: packageVersion(projectRoot, "@openai/codex"),
    },
    configuration: {
      model: typeof policy.model === "string" ? policy.model : null,
      reasoning_effort: typeof policy.model_reasoning_effort === "string"
        ? policy.model_reasoning_effort
        : null,
      policy: {
        authorized_ctf_only: typeof policy.authorized_ctf_only === "boolean" ? policy.authorized_ctf_only : null,
        allow_challenge_network: typeof policy.allow_challenge_network === "boolean" ? policy.allow_challenge_network : null,
        allow_external_web_research: typeof policy.allow_external_web_research === "boolean" ? policy.allow_external_web_research : null,
        auto_submit: typeof policy.auto_submit === "boolean" ? policy.auto_submit : null,
        live_telemetry: typeof policy.live_telemetry === "boolean" ? policy.live_telemetry : null,
        max_consecutive_stalls: Number.isInteger(policy.max_consecutive_stalls) ? policy.max_consecutive_stalls : null,
        stall_similarity_threshold: Number.isFinite(policy.stall_similarity_threshold) ? policy.stall_similarity_threshold : null,
        sandbox_mode: sandboxMode,
        approval_policy: typeof policy.approval_policy === "string" ? policy.approval_policy : null,
      },
      budgets: {
        max_continuation_rounds: Number.isInteger(policy.max_continuation_rounds) ? policy.max_continuation_rounds : null,
        wall_timeout_seconds: Number.isInteger(wallTimeoutSeconds) ? wallTimeoutSeconds : null,
        storage_reserve_bytes: STORAGE_RESERVE_BYTES,
        temp_reserve_bytes: TEMP_RESERVE_BYTES,
      },
    },
  };
}

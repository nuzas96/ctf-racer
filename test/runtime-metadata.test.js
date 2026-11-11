import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { collectRuntimeMetadata } from "../src/runtime-metadata.js";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-runtime-metadata-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skillsRoot = path.join(root, "installed-skills");
  fs.mkdirSync(path.join(skillsRoot, "ctf-crypto"), { recursive: true });
  fs.mkdirSync(path.join(skillsRoot, "ctf-solve"), { recursive: true });
  fs.writeFileSync(path.join(skillsRoot, "ctf-crypto", "SKILL.md"), "crypto instructions\n");
  fs.writeFileSync(path.join(skillsRoot, "ctf-crypto", "references.md"), "reference content\n");
  fs.writeFileSync(path.join(skillsRoot, "ctf-solve", "SKILL.md"), "solve instructions\n");
  const index = {
    schema_version: 1,
    fallback_skill: "ctf-solve/SKILL.md",
    routes: [{ id: "crypto", primary_skill: "ctf-crypto", signals: ["test signal"] }],
  };
  fs.writeFileSync(path.join(skillsRoot, "ROUTING_INDEX.json"), JSON.stringify(index) + "\n");
  return { root, skillsRoot };
}

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], { encoding: "utf8", stdio: "ignore" });
  assert.equal(result.status, 0, `git ${args.join(" ")} failed: ${result.error?.message ?? ""}`);
}

function initializeGit(root) {
  git(root, ["init", "--quiet"]);
  fs.writeFileSync(path.join(root, "tracked.txt"), "baseline\n");
  git(root, ["add", "tracked.txt", "installed-skills"]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--quiet", "-m", "fixture"]);
}

test("runtime metadata fingerprints a clean repository and installed Skills V2 content", (t) => {
  const { root, skillsRoot } = fixture(t);
  initializeGit(root);

  const metadata = collectRuntimeMetadata({
    projectRoot: root,
    skillsRoot,
    attemptId: "attempt-clean",
    activeSkills: ["ctf-solve", "ctf-crypto"],
    policy: { model: "fixture-model", model_reasoning_effort: "low", max_continuation_rounds: 3 },
    wallTimeoutSeconds: 120,
  });

  assert.match(metadata.repository.revision, /^[0-9a-f]{40}$/);
  assert.equal(metadata.repository.dirty, false);
  assert.equal(metadata.skills_v2.status, "available");
  assert.match(metadata.skills_v2.content_sha256, /^[0-9a-f]{64}$/);
  const indexHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(skillsRoot, "ROUTING_INDEX.json"))).digest("hex");
  assert.equal(metadata.skills_v2.routing_index_sha256, indexHash);
  assert.equal(metadata.skills_v2.files_hashed, 3);
  assert.equal(metadata.runtime.codex_sdk_version, null);
  assert.equal(metadata.runtime.codex_runtime_version, null);
  assert.equal(metadata.configuration.model, "fixture-model");
  assert.equal(metadata.configuration.reasoning_effort, "low");
  assert.equal(metadata.configuration.budgets.max_continuation_rounds, 3);
  assert.equal(metadata.configuration.budgets.wall_timeout_seconds, 120);
  const repeat = collectRuntimeMetadata({ projectRoot: root, skillsRoot, attemptId: "attempt-clean" });
  assert.equal(repeat.skills_v2.content_sha256, metadata.skills_v2.content_sha256);
  assert.equal(repeat.skills_v2.routing_index_sha256, metadata.skills_v2.routing_index_sha256);
});

test("runtime metadata marks tracked or untracked repository changes dirty without recording paths", (t) => {
  const { root, skillsRoot } = fixture(t);
  initializeGit(root);
  fs.writeFileSync(path.join(root, "tracked.txt"), "modified\n");
  fs.writeFileSync(path.join(root, "private-note.txt"), "not copied into metadata\n");

  const metadata = collectRuntimeMetadata({ projectRoot: root, skillsRoot });
  assert.equal(metadata.repository.dirty, true);
  assert.equal(JSON.stringify(metadata).includes("private-note.txt"), false);
  assert.equal(JSON.stringify(metadata).includes(root), false);
});

test("runtime metadata represents unavailable repository, Skills V2 and Codex package data as null", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-runtime-missing-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const metadata = collectRuntimeMetadata({ projectRoot: root, skillsRoot: path.join(root, "missing-skills") });
  assert.deepEqual(metadata.repository, { revision: null, dirty: null });
  assert.equal(metadata.skills_v2.status, "missing");
  assert.equal(metadata.skills_v2.content_sha256, null);
  assert.equal(metadata.skills_v2.routing_index_sha256, null);
  assert.equal(metadata.runtime.node_version, process.version);
  assert.equal(metadata.runtime.codex_sdk_version, null);
  assert.equal(metadata.runtime.codex_runtime_version, null);
  assert.equal(metadata.configuration.model, null);
  assert.equal(metadata.configuration.reasoning_effort, null);
  assert.equal(metadata.configuration.budgets.max_continuation_rounds, null);
  assert.equal(metadata.configuration.budgets.wall_timeout_seconds, null);
});

test("runtime metadata marks a routing index mismatched when it names an absent skill", (t) => {
  const { root, skillsRoot } = fixture(t);
  const indexPath = path.join(skillsRoot, "ROUTING_INDEX.json");
  fs.writeFileSync(indexPath, JSON.stringify({
    fallback_skill: "ctf-solve/SKILL.md",
    routes: [{ id: "missing", primary_skill: "ctf-missing", signals: ["missing"] }],
  }));

  const metadata = collectRuntimeMetadata({ projectRoot: root, skillsRoot });
  assert.equal(metadata.skills_v2.status, "mismatched");
  assert.equal(metadata.skills_v2.content_sha256, null);
  assert.equal(metadata.skills_v2.routing_index_sha256, crypto.createHash("sha256").update(fs.readFileSync(indexPath)).digest("hex"));
});

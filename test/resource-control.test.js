import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { EventEmitter } from "node:events";
import { storagePreflight, startStorageMonitor } from "../src/storage.js";
import { createRunControl } from "../src/run-control.js";
import { runProcess } from "../src/process.js";
import { solveChallenge } from "../src/runner.js";

const tempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "racer-resource-test-"));

test("storage preflight checks the temp and workspace filesystems without writing", () => {
  const workspacePath = tempDir();
  const result = storagePreflight({ workspacePath, tempReserveBytes: 0, workspaceReserveBytes: Number.MAX_SAFE_INTEGER });
  assert.equal(result.ok, false);
  assert.ok(result.checks.some((check) => check.paths.includes(workspacePath)));
  assert.ok(result.checks.every((check) => check.available_bytes >= 0));
});

test("storage monitor stops once a filesystem crosses the configured floor", async () => {
  let lowSpace;
  const monitor = startStorageMonitor({
    workspacePath: tempDir(), intervalMs: 10, minFreeBytes: Number.MAX_SAFE_INTEGER,
    onLowSpace: (info) => { lowSpace ??= info; },
  });
  await new Promise((resolve) => setTimeout(resolve, 30));
  monitor.stop();
  assert.ok(lowSpace);
  assert.equal(lowSpace.min_free_bytes, Number.MAX_SAFE_INTEGER);
});

test("wall deadline and explicit interrupt abort with durable reason", async (t) => {
  for (const reason of ["wall_timeout", "interrupted"]) {
    await t.test(reason, async () => {
      const root = tempDir();
      fs.mkdirSync(path.join(root, "solve"));
      fs.writeFileSync(path.join(root, "PROGRESS.md"), "# Progress\n");
      const state = { challenge_id: "bounded", status: "prepared", created_at: new Date().toISOString(), workspace: root, rounds: 0 };
      const signalSource = new EventEmitter();
      const control = createRunControl({ timeoutMs: reason === "wall_timeout" ? 20 : 0, processObject: signalSource });
      if (reason === "interrupted") setTimeout(() => signalSource.emit("SIGINT"), 20);
      const session = {
        run: (_prompt, { signal }) => new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(Object.assign(new Error("cancelled"), { name: "AbortError" })), { once: true });
        }),
      };
      try {
        const result = await solveChallenge({
          challenge: { id: "bounded", title: "bounded", description: "fixture", flag_regex: "FLAG\\{[^}]+\\}" },
          policy: { max_continuation_rounds: 2, max_consecutive_stalls: 2, stall_similarity_threshold: 0.82 },
          state, runRoot: root, session, skillNames: [], signal: control.signal,
        });
        assert.equal(result.state.status, "environment_interrupted");
        assert.equal(result.state.terminal_reason, reason);
        assert.equal(JSON.parse(fs.readFileSync(path.join(root, "state.json"), "utf8")).terminal_reason, reason);
      } finally { control.close(); }
    });
  }
});

test("hung subprocess is terminated at its wall deadline", async () => {
  const result = await runProcess(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { timeoutMs: 100 });
  assert.equal(result.timed_out, true);
  assert.notEqual(result.code, 0);
});

test("normal subprocess completion returns its output and exit status", async () => {
  const result = await runProcess(process.execPath, ["-e", "process.stdout.write('ok')"], { timeoutMs: 1000 });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, "ok");
  assert.equal(result.timed_out, false);
});

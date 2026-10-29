import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { assertIsolatedProfileConfig, verifierIsolationConfigOverrides, verifierProbeFiles, verifierReadPaths, verifyVerifierIsolation } from "../src/verifier-isolation.js";

test("verifier isolation config requires normalized absolute deny paths", () => {
  assert.throws(() => verifierIsolationConfigOverrides([]), /at least one deny-read path/);
  assert.throws(() => verifierIsolationConfigOverrides(["relative/secret"]), /absolute filesystem paths/);
  const config = verifierIsolationConfigOverrides(["/tmp/example/../secret", "/tmp/secret"]);
  assert.deepEqual(config, [
    'default_permissions="ctf_racer_isolated"',
    'permissions.ctf_racer_isolated={extends=":workspace",filesystem={"/tmp/secret"="deny"},network={enabled=false}}',
  ]);
  assert.match(verifierIsolationConfigOverrides(["/tmp/secret"], { allowChallengeNetwork: true })[1], /network=\{enabled=true\}/);
});

test("default verifier denies challenge sources, private answers, auth and controller research cache", () => {
  const projectRoot = path.join(os.tmpdir(), "example-project");
  fs.mkdirSync(path.join(projectRoot, "runs", "_research-cache"), { recursive: true });
  const paths = verifierReadPaths({ projectRoot, sourceDir: path.join(projectRoot, "local-challenges", "case"), codexHome: "/home/tester/.codex" });
  assert.ok(paths.includes(path.join(projectRoot, "local-challenges")));
  assert.ok(paths.includes(path.join(projectRoot, "runs", "_verifiers")));
  assert.ok(!paths.includes(path.join(projectRoot, "local-challenges", "case")));
  assert.ok(paths.includes("/home/tester/.codex/auth.json"));
  assert.ok(paths.includes(path.join(projectRoot, "runs", "_research-cache")));
});

test("controller-declared upstream reference paths are denied and probed", () => {
  const projectRoot = path.join(os.tmpdir(), "example-project");
  const privateFile = path.join(os.tmpdir(), "archive", "README.md");
  const paths = verifierReadPaths({ projectRoot, codexHome: "/home/tester/.codex", additionalPaths: [privateFile] });
  assert.ok(paths.includes(privateFile));
  assert.throws(() => verifierReadPaths({ projectRoot, additionalPaths: ["relative/private"] }), /absolute filesystem paths/);
});

test("legacy Codex sandbox config is rejected because it bypasses permission profiles", () => {
  const root = fs.mkdtempSync("/var/tmp/ctf-racer-codex-config-test-");
  try {
    const file = path.join(root, "config.toml");
    fs.writeFileSync(file, 'model = "test"\n');
    assert.doesNotThrow(() => assertIsolatedProfileConfig(root));
    fs.writeFileSync(file, 'sandbox_mode = "workspace-write"\n');
    assert.throws(() => assertIsolatedProfileConfig(root), /legacy sandbox settings/);
    fs.writeFileSync(file, 'profile = "legacy"\n');
    assert.throws(() => assertIsolatedProfileConfig(root), /legacy sandbox settings/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Codex sandbox denies verifier canary and confirms network-disabled tools cannot reach runner loopback", { skip: process.platform !== "linux" }, async () => {
  const root = fs.mkdtempSync("/var/tmp/ctf-racer-isolation-test-");
  const projectRoot = path.join(root, "project");
  const workspace = path.join(projectRoot, "runs", "case", "workspace");
  fs.mkdirSync(path.join(workspace, "solve"), { recursive: true });
  const localService = net.createServer((socket) => socket.end("fixture-only\n"));
  try {
    await new Promise((resolve, reject) => {
      localService.once("error", reject);
      localService.listen(0, "127.0.0.1", resolve);
    });
    const sourceDir = path.join(projectRoot, "local-challenges", "case");
    const codexHome = path.join(root, "codex-home");
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(path.join(sourceDir, "challenge.json"), '{"flag_sha256":"test-only"}\n', { mode: 0o600 });
    fs.writeFileSync(path.join(codexHome, "auth.json"), '{"test":"credential-canary"}\n', { mode: 0o600 });
    const archiveDir = path.join(root, "archive");
    fs.mkdirSync(archiveDir);
    const archiveReadme = path.join(archiveDir, "README.md");
    fs.writeFileSync(archiveReadme, "flag{test-only-answer}\n", { mode: 0o600 });
    const deniedPaths = [
      ...verifierReadPaths({ projectRoot, sourceDir, codexHome, additionalPaths: [archiveDir] }),
      path.join(codexHome, "auth.json"),
    ];
    const result = verifyVerifierIsolation({
      projectRoot,
      workspace,
      verifierRoot: path.join(projectRoot, "runs", "_verifiers"),
      deniedPaths,
      localServicePort: localService.address().port,
      probeFiles: verifierProbeFiles({ projectRoot, sourceDir, codexHome, additionalFiles: [archiveReadme] }),
    });
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.equal(result.solver_uid, process.getuid());
    assert.equal(result.controller_uid, process.getuid());
    assert.deepEqual(result.denied_access, {
      direct: true,
      symlink: true,
      self_root: true,
      controller_root: true,
      hardlink: true,
    });
    assert.equal(result.controller_verification, true);
    assert.equal(result.controller_access_to_probe_files, true);
    assert.equal(result.network_isolation.passed, true, JSON.stringify(result.network_isolation));
    assert.equal(result.network_isolation.separate_from_host, true);
    assert.equal(result.network_isolation.child_inherits_solver_namespace, true);
    assert.deepEqual(result.network_isolation.interfaces, ["lo"]);
    assert.equal(result.network_isolation.ipv4_route_count, 0);
    assert.equal(result.network_isolation.ipv6_nonloopback_route_count, 0);
    assert.equal(result.network_isolation.runner_loopback_connect, "denied");
    assert.deepEqual(result.probe_file_access, {
      0: { direct_denied: true, symlink_denied: true, hardlink_denied: true },
      1: { direct_denied: true, symlink_denied: true, hardlink_denied: true },
      2: { direct_denied: true, symlink_denied: true, hardlink_denied: true },
    });
    assert.equal(result.canary_link_count, 1);
  } finally {
    await new Promise((resolve) => localService.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

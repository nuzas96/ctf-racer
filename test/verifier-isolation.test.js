import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { prepareWorkspace } from "../src/workspace.js";
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

test("default verifier denies challenge sources, verifier material, auth, controller state, research cache, and controller docs", (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-verifier-default-paths-"));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  for (const name of ["_research-cache", "_history", "_postmortem"]) fs.mkdirSync(path.join(projectRoot, "runs", name), { recursive: true });
  const paths = verifierReadPaths({ projectRoot, sourceDir: path.join(projectRoot, "local-challenges", "case"), codexHome: path.join(projectRoot, "codex-home") });
  assert.ok(paths.includes(path.join(projectRoot, "local-challenges")));
  assert.ok(paths.includes(path.join(projectRoot, "runs", "_verifiers")));
  assert.ok(paths.includes(path.join(projectRoot, "runs", "_ctfd-controller")));
  assert.ok(paths.includes(path.join(projectRoot, "docs")));
  assert.ok(!paths.includes(path.join(projectRoot, "local-challenges", "case")));
  assert.ok(paths.includes(path.join(projectRoot, "codex-home", "auth.json")));
  assert.ok(paths.includes(path.join(projectRoot, "runs", "_research-cache")));
  assert.ok(paths.includes(path.join(projectRoot, "runs", "_history")));
  assert.ok(paths.includes(path.join(projectRoot, "runs", "_postmortem")));
});

test("controller-declared upstream reference paths are denied and probed", (t) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-verifier-reference-paths-"));
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const privateFile = path.join(projectRoot, "archive", "README.md");
  fs.mkdirSync(path.dirname(privateFile), { recursive: true });
  fs.writeFileSync(privateFile, "BENIGN_REFERENCE_CANARY\n");
  const paths = verifierReadPaths({ projectRoot, codexHome: path.join(projectRoot, "codex-home"), additionalPaths: [privateFile] });
  assert.ok(paths.includes(privateFile));
  assert.throws(() => verifierReadPaths({ projectRoot, additionalPaths: ["relative/private"] }), /absolute filesystem paths/);
});

test("environment Git alternates support quoted path lists, aliases, and fail closed on invalid entries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ctf-racer-git-alternates-"));
  try {
    const projectRoot = path.join(root, "project");
    const first = path.join(projectRoot, "objects-one");
    const second = path.join(projectRoot, "objects:two");
    fs.mkdirSync(projectRoot, { recursive: true });
    fs.mkdirSync(first);
    fs.mkdirSync(second);
    const alias = path.join(projectRoot, "objects-alias");
    fs.symlinkSync(first, alias, "dir");
    const env = { ...process.env, GIT_ALTERNATE_OBJECT_DIRECTORIES: `${JSON.stringify("objects-alias")}:${JSON.stringify(second)}` };
    const paths = verifierReadPaths({ projectRoot, codexHome: path.join(root, "codex"), env });
    assert.ok(paths.includes(alias));
    assert.ok(paths.includes(fs.realpathSync(alias)));
    assert.ok(paths.includes(second));
    const single = verifierReadPaths({
      projectRoot,
      env: { ...process.env, GIT_ALTERNATE_OBJECT_DIRECTORIES: "objects-one" },
    });
    assert.ok(single.includes(first));

    assert.throws(() => verifierReadPaths({
      projectRoot,
      env: { ...process.env, GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(root, "missing-objects") },
    }), /configured Git alternate object directory is missing or not a directory/);
    assert.throws(() => verifierReadPaths({
      projectRoot,
      env: { ...process.env, GIT_ALTERNATE_OBJECT_DIRECTORIES: '"unterminated' },
    }), /invalid GIT_ALTERNATE_OBJECT_DIRECTORIES quoting/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
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

test("Codex sandbox protects private Git and benchmark sources while preserving player and skill reads", { skip: process.platform !== "linux" }, async () => {
  const root = fs.mkdtempSync("/var/tmp/ctf-racer-isolation-test-");
  const projectRoot = path.join(root, "project");
  const workspace = path.join(projectRoot, "runs", "case", "workspace");
  const previousAlternateEnv = process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  const gitFixtureEnv = { ...process.env };
  delete gitFixtureEnv.GIT_ALTERNATE_OBJECT_DIRECTORIES;
  fs.mkdirSync(projectRoot, { recursive: true });
  const gitInit = spawnSync("git", ["init", "--quiet", projectRoot], { encoding: "utf8", env: gitFixtureEnv });
  assert.equal(gitInit.status, 0, gitInit.stderr);
  const gitBlob = spawnSync("git", ["-C", projectRoot, "hash-object", "-w", "--stdin"], {
    input: "BENIGN_GIT_OBJECT_CUSTODY_CANARY\n",
    encoding: "utf8",
    env: gitFixtureEnv,
  });
  assert.equal(gitBlob.status, 0, gitBlob.stderr);
  const objectHash = gitBlob.stdout.trim();
  const gitObjectCanary = path.join(projectRoot, ".git", "objects", objectHash.slice(0, 2), objectHash.slice(2));
  const alternateGitDir = path.join(root, "alternate.git");
  const alternateInit = spawnSync("git", ["init", "--quiet", "--bare", alternateGitDir], { encoding: "utf8", env: gitFixtureEnv });
  assert.equal(alternateInit.status, 0, alternateInit.stderr);
  const alternateBlob = spawnSync("git", ["--git-dir", alternateGitDir, "hash-object", "-w", "--stdin"], {
    input: "BENIGN_ALTERNATE_GIT_OBJECT_CANARY\n",
    encoding: "utf8",
    env: gitFixtureEnv,
  });
  assert.equal(alternateBlob.status, 0, alternateBlob.stderr);
  const alternateHash = alternateBlob.stdout.trim();
  const alternateObjectCanary = path.join(alternateGitDir, "objects", alternateHash.slice(0, 2), alternateHash.slice(2));
  fs.writeFileSync(path.join(projectRoot, ".git", "objects", "info", "alternates"), `${path.join(alternateGitDir, "objects")}\n`);
  const envAlternateDirs = [path.join(root, "environment-objects-one"), path.join(root, "environment:objects-two")];
  const envAlternateCanaries = envAlternateDirs.map((directory, index) => {
    const init = spawnSync("git", ["init", "--quiet", "--bare", directory], { encoding: "utf8", env: gitFixtureEnv });
    assert.equal(init.status, 0, init.stderr);
    const blob = spawnSync("git", ["--git-dir", directory, "hash-object", "-w", "--stdin"], {
      input: `BENIGN_ENV_ALTERNATE_CANARY_${index}\n`,
      encoding: "utf8",
      env: gitFixtureEnv,
    });
    assert.equal(blob.status, 0, blob.stderr);
    const hash = blob.stdout.trim();
    const objects = path.join(directory, "objects");
    const canary = path.join(objects, hash.slice(0, 2), hash.slice(2));
    return { objects, canary };
  });
  process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = envAlternateCanaries
    .map(({ objects }) => JSON.stringify(objects)).join(path.delimiter);
  const localService = net.createServer((socket) => socket.end("fixture-only\n"));
  try {
    await new Promise((resolve, reject) => {
      localService.once("error", reject);
      localService.listen(0, "127.0.0.1", resolve);
    });
    const sourceDir = path.join(projectRoot, "benchmarks", "legacy-fixture");
    fs.mkdirSync(path.join(sourceDir, "files"), { recursive: true });
    const challenge = {
      id: "case",
      title: "Benign legacy benchmark fixture",
      description: "Synthetic source tree; no solution data.",
      category: "misc",
    };
    fs.writeFileSync(path.join(sourceDir, "challenge.json"), JSON.stringify(challenge));
    const legacySolverCanary = path.join(sourceDir, "test_solver.py");
    fs.writeFileSync(legacySolverCanary, "BENIGN_LEGACY_SOLVER_CANARY\n", { mode: 0o600 });
    const benchmarkAlias = path.join(root, "legacy-benchmark-alias");
    fs.symlinkSync(sourceDir, benchmarkAlias);
    const benchmarkAliasCanary = path.join(benchmarkAlias, "test_solver.py");
    const playerArtifactSource = path.join(sourceDir, "files", "player.txt");
    fs.writeFileSync(playerArtifactSource, "BENIGN_PLAYER_ARTIFACT\n");
    const state = prepareWorkspace(projectRoot, sourceDir, challenge);
    const playerArtifact = path.join(state.workspace, "artifacts", "player.txt");
    const codexHome = path.join(root, "codex-home");
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(path.join(codexHome, "auth.json"), '{"test":"credential-canary"}\n', { mode: 0o600 });
    const docsDir = path.join(projectRoot, "docs");
    fs.mkdirSync(path.join(docsDir, "reports"), { recursive: true });
    fs.writeFileSync(path.join(docsDir, "EXPERIMENT_LEDGER.jsonl"), '{"verifier_digest":"ledger-canary"}\n', { mode: 0o600 });
    fs.writeFileSync(path.join(docsDir, "reports", "LATEST.md"), "controller report canary\n", { mode: 0o600 });
    const archiveDir = path.join(root, "archive");
    fs.mkdirSync(archiveDir);
    const archiveReadme = path.join(archiveDir, "README.md");
    fs.writeFileSync(archiveReadme, "flag{test-only-answer}\n", { mode: 0o600 });
    const ctfdPrivateDir = path.join(projectRoot, "runs", "_ctfd-controller");
    fs.mkdirSync(ctfdPrivateDir, { recursive: true, mode: 0o700 });
    const ctfdJournal = path.join(ctfdPrivateDir, "controller-canary.json");
    fs.writeFileSync(ctfdJournal, '{"controller_only":"offline-canary"}\n', { mode: 0o600 });
    const historyCanary = path.join(projectRoot, "runs", "_history", "fixture", "state.json");
    const postmortemCanary = path.join(projectRoot, "runs", "_postmortem", "fixture", "report.json");
    const researchCacheCanary = path.join(projectRoot, "runs", "_research-cache", "fixture", "README.md");
    for (const file of [historyCanary, postmortemCanary, researchCacheCanary]) {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, "BENIGN_HIDDEN_MATERIAL_CANARY\n", { mode: 0o600 });
    }
    const oldCacheAlias = path.join(root, "legacy-research-cache-alias");
    fs.symlinkSync(researchCacheCanary, oldCacheAlias);
    const hiddenCanaries = [legacySolverCanary, benchmarkAliasCanary, historyCanary, postmortemCanary, researchCacheCanary, oldCacheAlias, gitObjectCanary, alternateObjectCanary, ...envAlternateCanaries.map(({ canary }) => canary)];
    const hardlinkCapabilityProbe = path.join(root, "controller-hardlink-capability-probe");
    fs.linkSync(envAlternateCanaries[0].canary, hardlinkCapabilityProbe);
    fs.unlinkSync(hardlinkCapabilityProbe);
    const deniedPaths = [
      ...verifierReadPaths({ projectRoot, sourceDir, codexHome, additionalPaths: [archiveDir, sourceDir, benchmarkAlias] }),
      path.join(codexHome, "auth.json"),
    ];
    assert.ok(deniedPaths.includes(path.join(projectRoot, ".git")));
    assert.ok(deniedPaths.includes(path.join(alternateGitDir, "objects")));
    for (const { objects } of envAlternateCanaries) assert.ok(deniedPaths.includes(objects));
    assert.ok(deniedPaths.includes(sourceDir));
    assert.ok(deniedPaths.includes(benchmarkAlias));
    assert.ok(deniedPaths.includes(fs.realpathSync(benchmarkAlias)));
    const probeFiles = verifierProbeFiles({ projectRoot, sourceDir, codexHome, additionalFiles: [archiveReadme, ...hiddenCanaries] });
    const result = verifyVerifierIsolation({
      projectRoot,
      workspace,
      verifierRoot: path.join(projectRoot, "runs", "_verifiers"),
      deniedPaths,
      localServicePort: localService.address().port,
      probeFiles,
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
    const docsProbeIndexes = probeFiles
      .map((file, index) => ({ file, index }))
      .filter(({ file }) => file.startsWith(docsDir + path.sep));
    assert.equal(docsProbeIndexes.length, 2);
    for (const { index } of docsProbeIndexes) {
      assert.equal(result.probe_file_access[index].direct_denied, true);
      assert.equal(result.probe_file_access[index].symlink_denied, true);
      assert.equal(result.probe_file_access[index].hardlink_denied, true);
    }
    assert.equal(result.network_isolation.passed, true, JSON.stringify(result.network_isolation));
    assert.equal(result.network_isolation.separate_from_host, true);
    assert.equal(result.network_isolation.child_inherits_solver_namespace, true);
    assert.deepEqual(result.network_isolation.interfaces, ["lo"]);
    assert.equal(result.network_isolation.ipv4_route_count, 0);
    assert.equal(result.network_isolation.ipv6_nonloopback_route_count, 0);
    assert.equal(result.network_isolation.runner_loopback_connect, "denied");
    const controllerIndex = probeFiles.indexOf(ctfdJournal);
    assert.ok(controllerIndex >= 0);
    assert.equal(result.probe_file_access[controllerIndex].direct_denied, true);
    assert.equal(result.probe_file_access[controllerIndex].symlink_denied, true);
    assert.equal(result.probe_file_access[controllerIndex].hardlink_denied, true);
    for (const canary of hiddenCanaries) {
      const index = probeFiles.indexOf(canary);
      assert.ok(index >= 0, `missing probe for ${path.basename(canary)}`);
      assert.equal(result.probe_file_access[index].direct_denied, true, path.basename(canary));
      assert.equal(result.probe_file_access[index].symlink_denied, true, path.basename(canary));
      assert.equal(result.probe_file_access[index].hardlink_denied, true, path.basename(canary));
    }
    assert.ok(Object.keys(result.git_metadata_access).length >= 1);
    assert.ok(Object.values(result.git_metadata_access).every((item) => item.direct_denied && item.symlink_denied && item.hardlink_denied));
    assert.equal(result.controller_access_to_git_canaries, true);
    const skillFile = path.join(os.homedir(), ".codex", "skills", "ctf-solve", "SKILL.md");
    const allowedPaths = [playerArtifact, ...(fs.existsSync(skillFile) ? [skillFile] : [])];
    const readCommand = spawnSync(result.codex_binary, [
      "sandbox", "--permission-profile", "ctf_racer_isolated",
      ...verifierIsolationConfigOverrides(result.denied_paths).flatMap((value) => ["--config", value]),
      "--cd", state.workspace, "--", "/bin/sh", "-c",
      'for file do test -r "$file" || exit 7; done; echo allowed=1', "probe", ...allowedPaths,
    ], { encoding: "utf8", timeout: 10000 });
    assert.equal(readCommand.status, 0, readCommand.stderr);
    assert.match(readCommand.stdout, /allowed=1/);
    assert.equal(result.canary_link_count, 1);
  } finally {
    if (previousAlternateEnv === undefined) delete process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES;
    else process.env.GIT_ALTERNATE_OBJECT_DIRECTORIES = previousAlternateEnv;
    await new Promise((resolve) => localService.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

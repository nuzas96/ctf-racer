import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const PROFILE = "ctf_racer_isolated";
const require = createRequire(import.meta.url);

export function verifierReadPaths({ projectRoot, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") }) {
  return [...new Set([
    path.resolve(projectRoot, "local-challenges"),
    path.resolve(projectRoot, "runs", "_verifiers"),
    path.resolve(codexHome, "auth.json"),
  ])].sort();
}

export function verifierProbeFiles({ projectRoot, sourceDir, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex") }) {
  const files = [path.resolve(sourceDir, "challenge.json")];
  const authPath = path.resolve(codexHome, "auth.json");
  if (fs.existsSync(authPath)) files.push(authPath);
  const privateRoot = path.resolve(projectRoot, "runs", "_verifiers");
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  const rootStat = fs.lstatSync(privateRoot);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== process.getuid() || (rootStat.mode & 0o077) !== 0) {
    throw new Error("controller verifier directory must be owned by the controller and mode 0700 or stricter");
  }
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symlink found in controller verifier directory: ${full}`);
      const stat = fs.lstatSync(full);
      if (entry.isDirectory()) {
        if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0) throw new Error(`unsafe directory permissions in controller verifier tree: ${full}`);
        visit(full);
      }
      else if (entry.isFile()) {
        if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || stat.nlink !== 1) throw new Error(`unsafe verifier file custody: ${full}`);
        files.push(full);
      }
      else throw new Error(`non-regular entry found in controller verifier directory: ${full}`);
    }
  };
  visit(privateRoot);
  return [...new Set(files)].sort();
}

export function assertIsolatedProfileConfig(codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex")) {
  const candidates = [path.join(codexHome, "config.toml"), "/etc/codex/requirements.toml"];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    if (/^\s*sandbox_mode\s*=/m.test(text) || /^\s*\[sandbox_workspace_write\]\s*$/m.test(text) || /^\s*profile\s*=/m.test(text)) {
      throw new Error(`Codex configuration ${file} selects legacy sandbox settings; isolated permission profiles would not be active`);
    }
  }
}

export function verifierIsolationConfigOverrides(deniedPaths, { allowChallengeNetwork = false } = {}) {
  if (!Array.isArray(deniedPaths) || deniedPaths.length === 0) {
    throw new Error("verifier isolation requires at least one deny-read path");
  }
  const paths = [...new Set(deniedPaths.map((item) => {
    if (typeof item !== "string" || !path.isAbsolute(item) || /[\0\r\n]/.test(item)) {
      throw new Error("verifier deny-read paths must be absolute filesystem paths");
    }
    return path.resolve(item);
  }))].sort();
  const filesystem = paths.map((item) => `${JSON.stringify(item)}="deny"`).join(",");
  return [
    `default_permissions=${JSON.stringify(PROFILE)}`,
    `permissions.${PROFILE}={extends=":workspace",filesystem={${filesystem}},network={enabled=${allowChallengeNetwork ? "true" : "false"}}}`,
  ];
}

function bundledCodexBinary() {
  const sdkEntry = fileURLToPath(import.meta.resolve("@openai/codex-sdk"));
  const sdkRequire = createRequire(sdkEntry);
  const target = process.arch === "x64" ? "x86_64-unknown-linux-musl" : process.arch === "arm64" ? "aarch64-unknown-linux-musl" : null;
  if (!target) throw new Error(`verifier isolation unsupported on ${process.platform}/${process.arch}`);
  const platformPackage = process.arch === "x64" ? "@openai/codex-linux-x64/package.json" : "@openai/codex-linux-arm64/package.json";
  const platformPackageJson = sdkRequire.resolve(platformPackage);
  return path.join(path.dirname(platformPackageJson), "vendor", target, "bin", "codex");
}

function sandboxArgs(binary, deniedPaths, workspace, command, args) {
  return [
    "sandbox", "--permission-profile", PROFILE,
    ...verifierIsolationConfigOverrides(deniedPaths).flatMap((value) => ["--config", value]),
    "--cd", workspace,
    "--", command, ...args,
  ];
}

export function verifyVerifierIsolation({ projectRoot, workspace, deniedPaths, probeFiles = [], verifierRoot = path.join(projectRoot, "runs", "_verifiers"), timeoutMs = 10000 }) {
  if (process.platform !== "linux") throw new Error("verifier isolation probe currently requires the Codex Linux sandbox");
  const binary = bundledCodexBinary();
  if (!fs.existsSync(binary)) throw new Error(`bundled Codex sandbox not found: ${binary}`);
  const canaryDir = path.join(verifierRoot, `.isolation-probe-${randomUUID()}`);
  const canary = path.join(canaryDir, "canary.txt");
  const aliasDir = path.join(workspace, "solve");
  const symlink = path.join(aliasDir, `.isolation-probe-${randomUUID()}`);
  const hardlink = path.join(aliasDir, `.isolation-hardlink-${randomUUID()}`);
  const probeAliases = probeFiles.map(() => path.join(aliasDir, `.isolation-target-${randomUUID()}`));
  const probeHardlinks = probeFiles.map(() => path.join(aliasDir, `.isolation-target-link-${randomUUID()}`));
  fs.mkdirSync(canaryDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(aliasDir, { recursive: true });
  fs.writeFileSync(canary, `ctf-racer-isolation-${randomUUID()}\n`, { mode: 0o600, flag: "wx" });
  const expected = fs.readFileSync(canary, "utf8");
  fs.symlinkSync(canary, symlink);
  for (let i = 0; i < probeFiles.length; i++) fs.symlinkSync(probeFiles[i], probeAliases[i]);
  const tests = [
    'test -r "$1"; echo direct=$?',
    'test -r "$2"; echo symlink=$?',
    'test -r "/proc/self/root$1"; echo self_root=$?',
    'test -r "/proc/$3/root$1"; echo controller_root=$?',
    'ln "$1" "$4" >/dev/null 2>&1; echo hardlink=$?',
    ...probeFiles.flatMap((_, i) => [
      `test -r "$${5 + i * 3}"; echo target_${i}=$?`,
      `test -r "$${6 + i * 3}"; echo target_symlink_${i}=$?`,
      `ln "$${5 + i * 3}" "$${7 + i * 3}" >/dev/null 2>&1; echo target_hardlink_${i}=$?`,
    ]),
    'id -u | sed "s/^/uid=/"',
  ];
  const positional = ["ctf-racer-isolation-probe", canary, symlink, String(process.pid), hardlink];
  for (let i = 0; i < probeFiles.length; i++) positional.push(probeFiles[i], probeAliases[i], probeHardlinks[i]);
  const args = sandboxArgs(binary, deniedPaths, workspace, "/bin/sh", [
    "-c",
    tests.join("; "),
    ...positional,
  ]);
  let result;
  try {
    result = spawnSync(binary, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024, env: process.env });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Codex isolation probe exited ${result.status}: ${(result.stderr || "").trim()}`);
    const observations = Object.fromEntries((result.stdout || "").trim().split(/\r?\n/).map((line) => line.split("=")));
    const controllerCanRead = fs.readFileSync(canary, "utf8") === expected;
    const controllerCanReadTargets = probeFiles.every((item) => { try { fs.accessSync(item, fs.constants.R_OK); return true; } catch { return false; } });
    const probeLinkCounts = probeFiles.map((item) => { try { return fs.statSync(item).nlink; } catch { return null; } });
    const links = fs.statSync(canary).nlink;
    const checks = ["direct", "symlink", "self_root", "controller_root", "hardlink"];
    for (let i = 0; i < probeFiles.length; i++) checks.push(`target_${i}`, `target_symlink_${i}`, `target_hardlink_${i}`);
    const passed = checks.every((key) => observations[key] === "1") && observations.uid === String(process.getuid()) &&
      controllerCanRead && controllerCanReadTargets && links === 1 && probeLinkCounts.every((count) => count === 1) && probeHardlinks.every((item) => !fs.existsSync(item));
    return {
      passed,
      solver_uid: Number(observations.uid),
      controller_uid: process.getuid(),
      denied_paths: [...deniedPaths],
      denied_access: Object.fromEntries(["direct", "symlink", "self_root", "controller_root", "hardlink"].map((key) => [key, observations[key] === "1"])),
      controller_verification: controllerCanRead,
      controller_access_to_probe_files: controllerCanReadTargets,
      probe_file_link_counts: probeLinkCounts,
      probe_file_access: Object.fromEntries(probeFiles.map((_, i) => [i, {
        direct_denied: observations[`target_${i}`] === "1",
        symlink_denied: observations[`target_symlink_${i}`] === "1",
        hardlink_denied: observations[`target_hardlink_${i}`] === "1",
      }])),
      canary_link_count: links,
      sandbox_exit_code: result.status,
      codex_binary: binary,
    };
  } finally {
    try { fs.unlinkSync(symlink); } catch {}
    try { fs.unlinkSync(hardlink); } catch {}
    for (const item of [...probeAliases, ...probeHardlinks]) { try { fs.unlinkSync(item); } catch {} }
    try { fs.unlinkSync(canary); } catch {}
    try { fs.rmdirSync(canaryDir); } catch {}
  }
}

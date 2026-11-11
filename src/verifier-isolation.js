import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const PROFILE = "ctf_racer_isolated";
const require = createRequire(import.meta.url);

function validateAbsolutePaths(items, label) {
  if (!Array.isArray(items)) throw new Error(`${label} must be an array of absolute paths`);
  for (const item of items) {
    if (typeof item !== "string" || !path.isAbsolute(item) || /[\0\r\n]/.test(item)) {
      throw new Error(`${label} must contain only absolute filesystem paths`);
    }
  }
  return items.map((item) => path.resolve(item));
}

function canonicalPathAliases(items, { preserveAliases = false } = {}) {
  const paths = new Set();
  for (const item of items) {
    const resolved = path.resolve(item);
    try {
      const real = fs.realpathSync(resolved);
      paths.add(real);
      if (preserveAliases && real !== resolved) paths.add(resolved);
    } catch {
      paths.add(resolved);
    }
  }
  return [...paths].sort();
}

function splitGitPathList(value) {
  if (!value) return [];
  const separator = process.platform === "win32" ? ";" : ":";
  const entries = [];
  let entry = "";
  let quoted = false;
  let quoteClosed = false;
  for (let i = 0; i < value.length; i++) {
    const character = value[i];
    if (quoted && character === '"') {
      quoted = false;
      quoteClosed = true;
    } else if (quoted && character === "\\") {
      const escaped = value[++i];
      if (escaped === undefined) throw new Error("invalid GIT_ALTERNATE_OBJECT_DIRECTORIES quoting");
      const simpleEscapes = { a: "\x07", b: "\b", t: "\t", n: "\n", v: "\x0b", f: "\f", r: "\r", "\\": "\\", '"': '"' };
      if (Object.hasOwn(simpleEscapes, escaped)) entry += simpleEscapes[escaped];
      else if (/[0-7]/.test(escaped)) {
        let digits = escaped;
        while (digits.length < 3 && /[0-7]/.test(value[i + 1] ?? "")) digits += value[++i];
        entry += String.fromCharCode(Number.parseInt(digits, 8));
      } else throw new Error("invalid GIT_ALTERNATE_OBJECT_DIRECTORIES escape");
    } else if (!quoted && character === '"' && entry.length === 0 && !quoteClosed) {
      quoted = true;
    } else if (!quoted && character === separator) {
      if (!entry) throw new Error("empty GIT_ALTERNATE_OBJECT_DIRECTORIES entry");
      entries.push(entry);
      entry = "";
      quoteClosed = false;
    } else {
      if (quoteClosed) throw new Error("invalid GIT_ALTERNATE_OBJECT_DIRECTORIES quoting");
      entry += character;
    }
  }
  if (quoted) throw new Error("invalid GIT_ALTERNATE_OBJECT_DIRECTORIES quoting");
  if (!entry) throw new Error("empty GIT_ALTERNATE_OBJECT_DIRECTORIES entry");
  entries.push(entry);
  if (entries.some((item) => /[\0\r\n]/.test(item))) throw new Error("invalid GIT_ALTERNATE_OBJECT_DIRECTORIES path");
  return entries;
}

function resolvedObjectDirectory(value, base) {
  const resolved = path.resolve(base, value);
  let real;
  try {
    real = fs.realpathSync(resolved);
    if (!fs.statSync(real).isDirectory()) throw new Error();
  } catch {
    throw new Error("configured Git alternate object directory is missing or not a directory");
  }
  return [resolved, real];
}

function gitMetadataPaths(projectRoot, env = process.env) {
  const paths = [];
  const dotGit = path.join(projectRoot, ".git");
  if (fs.existsSync(dotGit)) paths.push(path.resolve(dotGit));

  const readGitPath = (args) => {
    const result = spawnSync("git", ["-C", projectRoot, ...args], {
      cwd: projectRoot,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000,
    });
    if (result.error || result.status !== 0) return null;
    const value = result.stdout.trim();
    return value ? path.resolve(projectRoot, value) : null;
  };
  const gitDir = readGitPath(["rev-parse", "--absolute-git-dir"]) ?? readGitPath(["rev-parse", "--git-dir"]);
  const commonDir = readGitPath(["rev-parse", "--path-format=absolute", "--git-common-dir"]) ??
    readGitPath(["rev-parse", "--git-common-dir"]);
  if (gitDir) paths.push(gitDir);
  if (commonDir) paths.push(commonDir);
  const objectDir = readGitPath(["rev-parse", "--git-path", "objects"]);
  if (objectDir) {
    const alternatesFile = path.join(objectDir, "info", "alternates");
    if (fs.existsSync(alternatesFile)) {
      for (const alternate of fs.readFileSync(alternatesFile, "utf8").split(/\r?\n/).filter(Boolean)) {
        paths.push(...resolvedObjectDirectory(alternate, objectDir));
      }
    }
  }
  for (const alternate of splitGitPathList(env.GIT_ALTERNATE_OBJECT_DIRECTORIES)) {
    paths.push(...resolvedObjectDirectory(alternate, projectRoot));
  }
  return [...new Set(paths)];
}

export function verifierReadPaths({ projectRoot, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), additionalPaths = [], env = process.env }) {
  const paths = [
    path.resolve(projectRoot, "local-challenges"),
    // Controller research records can contain verifier hashes and candidate outcomes.
    // The solver workspace does not need this project-owned documentation tree.
    path.resolve(projectRoot, "docs"),
    path.resolve(projectRoot, "runs", "_verifiers"),
    path.resolve(projectRoot, "runs", "_ctfd-controller"),
    ...gitMetadataPaths(projectRoot, env),
    path.resolve(codexHome, "auth.json"),
    ...validateAbsolutePaths(additionalPaths, "additional verifier deny paths"),
  ];
  for (const name of ["_history", "_postmortem"]) {
    const privateRunRoot = path.resolve(projectRoot, "runs", name);
    if (fs.existsSync(privateRunRoot)) paths.push(privateRunRoot);
  }
  // Research clones often retain upstream README files with literal flags.
  // This host stores the moved cache inside this explicitly denied controller root.
  const researchCache = path.resolve(projectRoot, "runs", "_research-cache");
  if (fs.existsSync(researchCache)) paths.push(researchCache);
  return canonicalPathAliases(paths, { preserveAliases: true });
}

function firstRegularFile(root) {
  const stack = [root];
  try {
    if (fs.lstatSync(root).isSymbolicLink()) return null;
    while (stack.length) {
      const directory = stack.pop();
      for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        if (entry.isSymbolicLink()) continue;
        const full = path.join(directory, entry.name);
        if (entry.isFile()) return full;
        if (entry.isDirectory()) stack.push(full);
      }
    }
  } catch {}
  return null;
}

export function verifierProbeFiles({ projectRoot, sourceDir, codexHome = process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), verifierRoot = path.join(projectRoot, "runs", "_verifiers"), additionalFiles = [] }) {
  const files = [path.resolve(sourceDir, "challenge.json"), ...validateAbsolutePaths(additionalFiles, "additional verifier probe files")];
  for (const name of ["_history", "_postmortem", "_research-cache"]) {
    const root = path.resolve(projectRoot, "runs", name);
    if (fs.existsSync(root)) {
      const probe = firstRegularFile(root);
      if (probe) files.push(probe);
    }
  }
  const ledgerPath = path.resolve(projectRoot, "docs", "EXPERIMENT_LEDGER.jsonl");
  const latestReportPath = path.resolve(projectRoot, "docs", "reports", "LATEST.md");
  if (fs.existsSync(ledgerPath)) files.push(ledgerPath);
  if (fs.existsSync(latestReportPath)) files.push(latestReportPath);
  const authPath = path.resolve(codexHome, "auth.json");
  if (fs.existsSync(authPath)) files.push(authPath);
  const privateRoots = [...new Set([
    path.resolve(verifierRoot),
    path.resolve(projectRoot, "runs", "_ctfd-controller"),
  ])];
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
        if (stat.uid !== process.getuid() || (stat.mode & 0o077) !== 0 || stat.nlink !== 1) throw new Error(`unsafe controller-private file custody: ${full}`);
        files.push(full);
      }
      else throw new Error(`non-regular entry found in controller verifier directory: ${full}`);
    }
  };
  for (const privateRoot of privateRoots) {
    fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
    const rootStat = fs.lstatSync(privateRoot);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || rootStat.uid !== process.getuid() || (rootStat.mode & 0o077) !== 0) {
      throw new Error("controller-private directory must be owned by the controller and mode 0700 or stricter");
    }
    visit(privateRoot);
  }
  return canonicalPathAliases([...new Set(files)], { preserveAliases: true });
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
  const paths = canonicalPathAliases(deniedPaths.map((item) => {
    if (typeof item !== "string" || !path.isAbsolute(item) || /[\0\r\n]/.test(item)) {
      throw new Error("verifier deny-read paths must be absolute filesystem paths");
    }
    return item;
  }));
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

export function verifyVerifierIsolation({ projectRoot, workspace, deniedPaths, probeFiles = [], localServicePort, verifierRoot = path.join(projectRoot, "runs", "_verifiers"), timeoutMs = 10000, env = process.env }) {
  if (process.platform !== "linux") throw new Error("verifier isolation probe currently requires the Codex Linux sandbox");
  if (localServicePort != null && (!Number.isInteger(localServicePort) || localServicePort < 1 || localServicePort > 65535)) {
    throw new Error("local service isolation probe requires a valid TCP port");
  }
  const gitPaths = gitMetadataPaths(projectRoot, env);
  const effectiveDeniedPaths = canonicalPathAliases([...deniedPaths, ...gitPaths], { preserveAliases: true });
  const binary = bundledCodexBinary();
  if (!fs.existsSync(binary)) throw new Error(`bundled Codex sandbox not found: ${binary}`);
  const canaryDir = path.join(verifierRoot, `.isolation-probe-${randomUUID()}`);
  const canary = path.join(canaryDir, "canary.txt");
  const aliasDir = path.join(workspace, "solve");
  const symlink = path.join(aliasDir, `.isolation-probe-${randomUUID()}`);
  const hardlink = path.join(aliasDir, `.isolation-hardlink-${randomUUID()}`);
  const probeAliases = probeFiles.map(() => path.join(aliasDir, `.isolation-target-${randomUUID()}`));
  const probeHardlinks = probeFiles.map(() => path.join(aliasDir, `.isolation-target-link-${randomUUID()}`));
  const gitProbeDirs = [];
  const gitProbeFiles = [];
  try {
    for (const gitPath of gitPaths) {
      let stat;
      try { stat = fs.statSync(gitPath); } catch { continue; }
      if (!stat.isDirectory()) continue;
      const probeDir = path.join(gitPath, `.ctf-racer-isolation-probe-${randomUUID()}`);
      fs.mkdirSync(probeDir, { mode: 0o700 });
      gitProbeDirs.push(probeDir);
      const probeFile = path.join(probeDir, "canary.txt");
      fs.writeFileSync(probeFile, `ctf-racer-git-isolation-${randomUUID()}\n`, { mode: 0o600, flag: "wx" });
      gitProbeFiles.push(probeFile);
    }
  } catch (error) {
    for (const item of gitProbeFiles) { try { fs.unlinkSync(item); } catch {} }
    for (const item of gitProbeDirs) { try { fs.rmdirSync(item); } catch {} }
    throw error;
  }
  const allProbeFiles = [...probeFiles, ...gitProbeFiles];
  const allProbeAliases = [...probeAliases, ...gitProbeFiles.map(() => path.join(aliasDir, `.isolation-git-target-${randomUUID()}`))];
  const allProbeHardlinks = [...probeHardlinks, ...gitProbeFiles.map(() => path.join(aliasDir, `.isolation-git-target-link-${randomUUID()}`))];
  fs.mkdirSync(canaryDir, { recursive: true, mode: 0o700 });
  fs.mkdirSync(aliasDir, { recursive: true });
  fs.writeFileSync(canary, `ctf-racer-isolation-${randomUUID()}\n`, { mode: 0o600, flag: "wx" });
  const expected = fs.readFileSync(canary, "utf8");
  fs.symlinkSync(canary, symlink);
  for (let i = 0; i < allProbeFiles.length; i++) fs.symlinkSync(allProbeFiles[i], allProbeAliases[i]);
  const tests = [
    'test -r "$1"; echo direct=$?',
    'test -r "$2"; echo symlink=$?',
    'test -r "/proc/self/root$1"; echo self_root=$?',
    'test -r "/proc/$3/root$1"; echo controller_root=$?',
    'ln "$1" "$4" >/dev/null 2>&1; echo hardlink=$?',
    ...allProbeFiles.flatMap((_, i) => [
      `test -r "$${5 + i * 3}"; echo target_${i}=$?`,
      `test -r "$${6 + i * 3}"; echo target_symlink_${i}=$?`,
      `ln "$${5 + i * 3}" "$${7 + i * 3}" >/dev/null 2>&1; echo target_hardlink_${i}=$?`,
    ]),
    'id -u | sed "s/^/uid=/"',
    'readlink /proc/self/ns/net | sed "s/^/network_namespace=/"',
    'sh -c "readlink /proc/self/ns/net" | sed "s/^/child_network_namespace=/"',
    'python3 -c "print(\',\'.join(line.split(\':\')[0].strip() for line in open(\'/proc/net/dev\').read().splitlines()[2:]))" | sed "s/^/network_interfaces=/"',
    'awk "NR>1{n++} END{print n+0}" /proc/net/route | sed "s/^/ipv4_routes=/"',
    'awk "NF{n++} END{print n+0}" /proc/net/ipv6_route | sed "s/^/ipv6_routes=/"',
    'python3 -c "print(sum(1 for line in open(\'/proc/net/ipv6_route\') if line.split() and line.split()[-1] != \'lo\'))" | sed "s/^/ipv6_nonloopback_routes=/"',
    ...(localServicePort == null ? [] : [`python3 -c "import socket; s=socket.socket(); s.settimeout(1); s.connect(('127.0.0.1',${Number(localServicePort)})); s.close()" >/dev/null 2>&1; echo runner_loopback_connect=$?`]),
  ];
  const positional = ["ctf-racer-isolation-probe", canary, symlink, String(process.pid), hardlink];
  for (let i = 0; i < allProbeFiles.length; i++) positional.push(allProbeFiles[i], allProbeAliases[i], allProbeHardlinks[i]);
  const args = sandboxArgs(binary, effectiveDeniedPaths, workspace, "/bin/sh", [
    "-c",
    tests.join("; "),
    ...positional,
  ]);
  let result;
  try {
    result = spawnSync(binary, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 1024 * 1024, env });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Codex isolation probe exited ${result.status}: ${(result.stderr || "").trim()}`);
    const observations = Object.fromEntries((result.stdout || "").trim().split(/\r?\n/).map((line) => line.split("=")));
    const controllerCanRead = fs.readFileSync(canary, "utf8") === expected;
    const controllerCanReadTargets = probeFiles.every((item) => { try { fs.accessSync(item, fs.constants.R_OK); return true; } catch { return false; } });
    const controllerCanReadGitProbes = gitProbeFiles.every((item) => { try { fs.accessSync(item, fs.constants.R_OK); return true; } catch { return false; } });
    const probeLinkCounts = probeFiles.map((item) => { try { return fs.statSync(item).nlink; } catch { return null; } });
    const gitProbeLinkCounts = gitProbeFiles.map((item) => { try { return fs.statSync(item).nlink; } catch { return null; } });
    const links = fs.statSync(canary).nlink;
    const hostNetworkNamespace = fs.readlinkSync("/proc/self/ns/net");
    const checks = ["direct", "symlink", "self_root", "controller_root", "hardlink"];
    for (let i = 0; i < allProbeFiles.length; i++) checks.push(`target_${i}`, `target_symlink_${i}`, `target_hardlink_${i}`);
    const networkIsolation = {
      host_namespace: hostNetworkNamespace,
      solver_namespace: observations.network_namespace,
      child_namespace: observations.child_network_namespace,
      separate_from_host: Boolean(observations.network_namespace && observations.network_namespace !== hostNetworkNamespace),
      child_inherits_solver_namespace: Boolean(observations.network_namespace && observations.child_network_namespace === observations.network_namespace),
      interfaces: (observations.network_interfaces ?? "").split(",").filter(Boolean),
      ipv4_route_count: Number(observations.ipv4_routes),
      ipv6_route_count: Number(observations.ipv6_routes),
      ipv6_nonloopback_route_count: Number(observations.ipv6_nonloopback_routes),
      runner_loopback_connect: observations.runner_loopback_connect === "0" ? "reachable" : observations.runner_loopback_connect === "1" ? "denied" : "not_tested",
    };
    networkIsolation.passed = networkIsolation.separate_from_host && networkIsolation.child_inherits_solver_namespace &&
      networkIsolation.interfaces.length === 1 && networkIsolation.interfaces[0] === "lo" &&
      networkIsolation.ipv4_route_count === 0 && networkIsolation.ipv6_nonloopback_route_count === 0;
    const passed = checks.every((key) => observations[key] === "1") && observations.uid === String(process.getuid()) && networkIsolation.passed &&
      controllerCanRead && controllerCanReadTargets && controllerCanReadGitProbes && links === 1 &&
      probeLinkCounts.every((count) => count === 1) && gitProbeLinkCounts.every((count) => count === 1) &&
      allProbeHardlinks.every((item) => !fs.existsSync(item));
    return {
      passed,
      solver_uid: Number(observations.uid),
      controller_uid: process.getuid(),
      denied_paths: effectiveDeniedPaths,
      denied_access: Object.fromEntries(["direct", "symlink", "self_root", "controller_root", "hardlink"].map((key) => [key, observations[key] === "1"])),
      controller_verification: controllerCanRead,
      controller_access_to_probe_files: controllerCanReadTargets,
      probe_file_link_counts: probeLinkCounts,
      probe_file_access: Object.fromEntries(probeFiles.map((_, i) => [i, {
        direct_denied: observations[`target_${i}`] === "1",
        symlink_denied: observations[`target_symlink_${i}`] === "1",
        hardlink_denied: observations[`target_hardlink_${i}`] === "1",
      }])),
      git_metadata_access: Object.fromEntries(gitProbeFiles.map((_, i) => {
        const index = probeFiles.length + i;
        return [`git_metadata_${i}`, {
          direct_denied: observations[`target_${index}`] === "1",
          symlink_denied: observations[`target_symlink_${index}`] === "1",
          hardlink_denied: observations[`target_hardlink_${index}`] === "1",
        }];
      })),
      controller_access_to_git_canaries: controllerCanReadGitProbes,
      canary_link_count: links,
      sandbox_exit_code: result.status,
      codex_binary: binary,
      network_isolation: networkIsolation,
    };
  } finally {
    try { fs.unlinkSync(symlink); } catch {}
    try { fs.unlinkSync(hardlink); } catch {}
    for (const item of [...allProbeAliases, ...allProbeHardlinks]) { try { fs.unlinkSync(item); } catch {} }
    for (const item of gitProbeFiles) { try { fs.unlinkSync(item); } catch {} }
    for (const item of gitProbeDirs) { try { fs.rmdirSync(item); } catch {} }
    try { fs.unlinkSync(canary); } catch {}
    try { fs.rmdirSync(canaryDir); } catch {}
  }
}

import { spawn } from "node:child_process";

export function runProcess(command, args, { cwd, env, timeoutMs = 120000, signal, stdio = ["ignore", "pipe", "pipe"] } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio, detached: process.platform !== "win32" });
    let settled = false;
    let timedOut = false;
    let aborted = false;
    let forceTimer = null;
    let stdout = "";
    let stderr = "";
    if (child.stdout) child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    if (child.stderr) child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    const killTree = () => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch { /* already exited */ }
      forceTimer = setTimeout(() => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch { /* already exited */ }
      }, 1000);
      forceTimer.unref?.();
    };
    const timer = setTimeout(() => { timedOut = true; killTree(); }, timeoutMs);
    const onAbort = () => { aborted = true; killTree(); };
    signal?.addEventListener("abort", onAbort, { once: true });
    const cleanup = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("close", (code, signalName) => {
      cleanup();
      resolve({ code, signal: signalName, stdout, stderr, timed_out: timedOut, aborted });
    });
    if (signal?.aborted) onAbort();
  });
}

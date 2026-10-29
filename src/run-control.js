export function createRunControl({ timeoutMs, onStop, processObject = process } = {}) {
  const controller = new AbortController();
  let stoppedBy = null;
  const stop = (reason) => {
    if (controller.signal.aborted) return;
    stoppedBy = reason;
    controller.abort(reason);
    onStop?.(reason);
  };
  const onInterrupt = () => stop("interrupted");
  const timer = timeoutMs ? setTimeout(() => stop("wall_timeout"), timeoutMs) : null;
  processObject.once("SIGINT", onInterrupt);
  processObject.once("SIGTERM", onInterrupt);
  return {
    signal: controller.signal,
    stop,
    get reason() { return stoppedBy; },
    close() {
      if (timer) clearTimeout(timer);
      processObject.removeListener("SIGINT", onInterrupt);
      processObject.removeListener("SIGTERM", onInterrupt);
    },
  };
}

function oneLine(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function safeText(value, redact, max = 320) {
  const raw = oneLine(value);
  const redacted = redact ? redact(raw) : raw;
  return redacted.length > max ? redacted.slice(0, max - 1) + "…" : redacted;
}

function elapsed(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function prefix(round, startedMs) {
  return `[ctf-racer][live][r${round}][${elapsed(Date.now() - startedMs)}]`;
}

function todoSummary(item, redact) {
  const total = item.items?.length ?? 0;
  const done = item.items?.filter((todo) => todo.completed).length ?? 0;
  const next = item.items?.find((todo) => !todo.completed)?.text;
  return next
    ? `todo ${done}/${total}: ${safeText(next, redact, 220)}`
    : `todo ${done}/${total}: complete`;
}

export function telemetryLines(event, { round, startedMs, redact } = {}) {
  const p = prefix(round ?? 0, startedMs ?? Date.now());

  if (event.type === "turn.started") return [`${p} turn started`];
  if (event.type === "turn.failed") return [`${p} turn failed: ${safeText(event.error?.message, redact, 300)}`];
  if (event.type === "error") return [`${p} stream error: ${safeText(event.message, redact, 300)}`];

  if (event.type === "turn.completed") {
    const usage = event.usage ?? {};
    return [
      `${p} turn completed tokens in=${usage.input_tokens ?? 0} cached=${usage.cached_input_tokens ?? 0} out=${usage.output_tokens ?? 0} reasoning=${usage.reasoning_output_tokens ?? 0}`,
    ];
  }

  if (!["item.started", "item.updated", "item.completed"].includes(event.type) || !event.item) return [];
  const item = event.item;

  // Never surface model reasoning content. Operator telemetry is execution/progress only.
  if (item.type === "reasoning") return [];

  if (item.type === "command_execution") {
    if (event.type === "item.started") {
      return [`${p} command: ${safeText(item.command, redact, 260)}`];
    }
    if (event.type === "item.completed") {
      const exit = item.exit_code === undefined ? "" : ` exit=${item.exit_code}`;
      return [`${p} command ${item.status}${exit}: ${safeText(item.command, redact, 220)}`];
    }
    return [];
  }

  if (item.type === "file_change" && event.type === "item.completed") {
    return (item.changes ?? []).map((change) =>
      `${p} file ${change.kind}: ${safeText(change.path, redact, 240)}`
    );
  }

  if (item.type === "todo_list" && ["item.started", "item.updated", "item.completed"].includes(event.type)) {
    return [`${p} ${todoSummary(item, redact)}`];
  }

  if (item.type === "agent_message" && event.type === "item.completed") {
    const text = safeText(item.text, redact, 520);
    return text ? [`${p} agent: ${text}`] : [];
  }

  if (item.type === "mcp_tool_call") {
    const tool = `${safeText(item.server, redact, 80)}/${safeText(item.tool, redact, 120)}`;
    if (event.type === "item.started") return [`${p} tool: ${tool}`];
    if (event.type === "item.completed") return [`${p} tool ${item.status}: ${tool}`];
    return [];
  }

  if (item.type === "error" && event.type === "item.completed") {
    return [`${p} agent error: ${safeText(item.message, redact, 300)}`];
  }

  // Web search is disabled by policy; if an SDK event appears anyway, show only the query.
  if (item.type === "web_search" && event.type === "item.completed") {
    return [`${p} web search: ${safeText(item.query, redact, 240)}`];
  }

  return [];
}

import test from "node:test";
import assert from "node:assert/strict";
import { CodexAgentSession } from "../src/agent.js";
import { telemetryLines } from "../src/telemetry.js";

async function* successfulEvents() {
  yield { type: "thread.started", thread_id: "thread-test" };
  yield { type: "turn.started" };
  yield { type: "item.completed", item: { id: "r", type: "reasoning", text: "private reasoning summary" } };
  yield {
    type: "item.started",
    item: { id: "c", type: "command_execution", command: "python3 solve.py", aggregated_output: "", status: "in_progress" },
  };
  yield {
    type: "item.completed",
    item: { id: "c", type: "command_execution", command: "python3 solve.py", aggregated_output: "SECRET_OUTPUT", exit_code: 0, status: "completed" },
  };
  yield { type: "item.completed", item: { id: "m1", type: "agent_message", text: "intermediate update" } };
  yield { type: "item.completed", item: { id: "m2", type: "agent_message", text: "final answer" } };
  yield {
    type: "turn.completed",
    usage: { input_tokens: 10, cached_input_tokens: 4, cache_write_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 2 },
  };
}

test("streamed agent preserves final-response semantics and exposes events", async () => {
  const seen = [];
  const thread = { runStreamed: async () => ({ events: successfulEvents() }) };
  const session = new CodexAgentSession(thread);
  const result = await session.run("solve", { onEvent: (event) => seen.push(event.type) });
  assert.equal(result.finalResponse, "final answer");
  assert.equal(result.usage.output_tokens, 5);
  assert.ok(seen.includes("item.started"));
  assert.ok(seen.includes("turn.completed"));
});

test("live telemetry suppresses reasoning and command output while redacting secrets", () => {
  const options = {
    round: 1,
    startedMs: Date.now(),
    redact: (value) => String(value).replaceAll("DYNAMIC_FLAG", "[REDACTED_FLAG]"),
  };

  const reasoning = telemetryLines(
    { type: "item.completed", item: { id: "r", type: "reasoning", text: "DYNAMIC_FLAG internal chain" } },
    options,
  );
  assert.deepEqual(reasoning, []);

  const command = telemetryLines(
    {
      type: "item.completed",
      item: {
        id: "c",
        type: "command_execution",
        command: "python3 exploit.py DYNAMIC_FLAG",
        aggregated_output: "DYNAMIC_FLAG SECRET_OUTPUT",
        exit_code: 0,
        status: "completed",
      },
    },
    options,
  ).join("\n");
  assert.match(command, /\[REDACTED_FLAG\]/);
  assert.equal(command.includes("DYNAMIC_FLAG"), false);
  assert.equal(command.includes("SECRET_OUTPUT"), false);

  const message = telemetryLines(
    { type: "item.completed", item: { id: "m", type: "agent_message", text: "found DYNAMIC_FLAG" } },
    options,
  ).join("\n");
  assert.match(message, /found \[REDACTED_FLAG\]/);
});

test("streamed agent throws on turn failure", async () => {
  async function* events() {
    yield { type: "turn.started" };
    yield { type: "turn.failed", error: { message: "boom" } };
  }
  const session = new CodexAgentSession({ runStreamed: async () => ({ events: events() }) });
  await assert.rejects(session.run("solve"), /boom/);
});

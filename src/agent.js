export function threadOptions(workingDirectory, policy) {
  return {
    workingDirectory,
    sandboxMode: policy.sandbox_mode,
    approvalPolicy: policy.approval_policy,
    model: policy.model,
    modelReasoningEffort: policy.model_reasoning_effort,
    networkAccessEnabled: policy.allow_challenge_network === true,
    webSearchMode: "disabled",
    webSearchEnabled: false,
  };
}

export class CodexAgentSession {
  constructor(thread) {
    this.thread = thread;
  }

  static async create(workingDirectory, policy) {
    const { Codex } = await import("@openai/codex-sdk");
    const codex = new Codex({});
    const thread = await codex.startThread(threadOptions(workingDirectory, policy));
    return new CodexAgentSession(thread);
  }

  async run(prompt, { onEvent } = {}) {
    const { events } = await this.thread.runStreamed(prompt);
    let finalResponse = "";
    let usage = null;
    let failure = null;

    for await (const event of events) {
      onEvent?.(event);

      if (event.type === "item.completed" && event.item?.type === "agent_message") {
        finalResponse = event.item.text ?? "";
      } else if (event.type === "turn.completed") {
        usage = event.usage ?? null;
      } else if (event.type === "turn.failed") {
        failure = event.error?.message ?? "Codex turn failed";
      } else if (event.type === "error") {
        failure = event.message ?? "Codex stream failed";
      }
    }

    if (failure) throw new Error(failure);
    return { finalResponse, usage };
  }
}

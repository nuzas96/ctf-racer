export class CodexAgentSession {
  constructor(thread) {
    this.thread = thread;
  }

  static async create(workingDirectory, policy) {
    const { Codex } = await import("@openai/codex-sdk");
    const codex = new Codex({});
    const thread = await codex.startThread({
      workingDirectory,
      sandboxMode: policy.sandbox_mode,
      approvalPolicy: policy.approval_policy,
    });
    return new CodexAgentSession(thread);
  }

  async run(prompt) {
    const result = await this.thread.run(prompt);
    return { finalResponse: result.finalResponse ?? "" };
  }
}

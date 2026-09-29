import fs from "node:fs";
import path from "node:path";

export const DEFAULT_POLICY = {
  authorized_ctf_only: true,
  allow_external_web_research: false,
  allow_challenge_network: false,
  auto_submit: false,
  sandbox_mode: "workspace-write",
  approval_policy: "never",
  model: "gpt-5.6-luna",
  model_reasoning_effort: "medium",
  max_continuation_rounds: 4,
};

export function loadPolicy(projectRoot) {
  const policyPath = path.join(projectRoot, "config", "policy.json");
  if (!fs.existsSync(policyPath)) return { ...DEFAULT_POLICY };
  const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  return { ...DEFAULT_POLICY, ...parsed };
}

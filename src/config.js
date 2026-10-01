import fs from "node:fs";
import path from "node:path";

export const DEFAULT_POLICY = {
  authorized_ctf_only: true,
  allow_external_web_research: false,
  allow_challenge_network: false,
  auto_submit: false,
  sandbox_mode: "workspace-write",
  approval_policy: "never",
  model: "gpt-6-luna",
  model_reasoning_effort: "medium",
  live_telemetry: true,
  competition_concurrency: 5,
  fresh_retry_attempts: 1,
  stall_similarity_threshold: 0.82,
  max_consecutive_stalls: 2,
  max_continuation_rounds: 4,
};

export function loadPolicy(projectRoot) {
  const policyPath = path.join(projectRoot, "config", "policy.json");
  if (!fs.existsSync(policyPath)) return { ...DEFAULT_POLICY };
  const parsed = JSON.parse(fs.readFileSync(policyPath, "utf8"));
  return { ...DEFAULT_POLICY, ...parsed };
}

export function policyForChallenge(policy, challenge, serviceHandle) {
  return {
    ...policy,
    allow_external_web_research: false,
    allow_challenge_network: challenge.service?.network_access === true && serviceHandle?.network_access === true,
  };
}

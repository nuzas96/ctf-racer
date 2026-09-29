import test from "node:test";
import assert from "node:assert/strict";
import { initialPrompt } from "../src/prompt.js";

test("explicitly invokes routed installed Codex skill", () => {
  const prompt = initialPrompt(
    {},
    {
      allow_external_web_research: false,
      allow_challenge_network: false,
      auto_submit: false,
    },
    "ctf-crypto"
  );

  assert.match(prompt, /\$ctf-crypto/);
  assert.match(prompt, /SKILL_PROOF\.md/);
  assert.doesNotMatch(prompt, /read SKILLS\.md/i);
});

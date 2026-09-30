import test from "node:test";
import assert from "node:assert/strict";
import { initialPrompt } from "../src/prompt.js";

test("invokes ctf-solve before the primary category skill", () => {
  const prompt = initialPrompt(
    {},
    {
      allow_external_web_research: false,
      allow_challenge_network: false,
      auto_submit: false,
    },
    ["ctf-solve", "ctf-crypto"]
  );

  assert.match(prompt, /\$ctf-solve/);
  assert.match(prompt, /\$ctf-crypto/);
  assert.ok(prompt.indexOf("$ctf-solve") < prompt.indexOf("$ctf-crypto"));
  assert.match(prompt, /PROGRESS\.md/);
  assert.match(prompt, /SKILL_PROOF\.md/);
  assert.doesNotMatch(prompt, /read SKILLS\.md/i);
});

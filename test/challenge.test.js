import test from "node:test";
import assert from "node:assert/strict";
import { safeChallengeId } from "../src/challenge.js";

test("normalizes challenge ids", () => {
  assert.equal(safeChallengeId("web / chall #1"), "web-chall-1");
});

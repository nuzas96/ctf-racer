import test from "node:test";
import assert from "node:assert/strict";
import { extractFlag, verifyFlagCandidate } from "../src/flag.js";

test("prefers explicit CTF_RACER_FLAG marker", () => {
  assert.equal(
    extractFlag("done\nCTF_RACER_FLAG=NADI{abc}\n", "NADI\\{[^}]+\\}", "NADI{...}"),
    "NADI{abc}"
  );
});

test("falls back to challenge regex", () => {
  assert.equal(
    extractFlag("candidate NADI{xyz_123}", "NADI\\{[A-Za-z0-9_]+\\}", "NADI{...}"),
    "NADI{xyz_123}"
  );
});

test("rejects challenge-format placeholder as a candidate", () => {
  assert.equal(
    extractFlag("CTF_RACER_FLAG=NADI{...}", "NADI\\{[^}]+\\}", "NADI{...}"),
    undefined
  );
});

test("skips placeholder mention and accepts later concrete candidate", () => {
  assert.equal(
    extractFlag("format NADI{...}\nrecovered NADI{real_value}", "NADI\\{[^}]+\\}", "NADI{...}"),
    "NADI{real_value}"
  );
});

test("benchmark verification accepts only the exact hashed flag", () => {
  const hash = "7c0b81f6de188eea8c5f3a3b44ff364d7d9cd108f2eb62d00995e1653602a72d";
  assert.equal(verifyFlagCandidate("NADI{recycled_keystreams_leak_everything}", hash), true);
  assert.equal(verifyFlagCandidate("NADI{recycled_keystream}", hash), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { extractFlag } from "../src/flag.js";

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

test("rejects challenge-format placeholder as solved", () => {
  assert.equal(
    extractFlag("CTF_RACER_FLAG=NADI{...}", "NADI\\{[^}]+\\}", "NADI{...}"),
    undefined
  );
});

test("skips placeholder mention and accepts later concrete flag", () => {
  assert.equal(
    extractFlag("format NADI{...}\nrecovered NADI{real_value}", "NADI\\{[^}]+\\}", "NADI{...}"),
    "NADI{real_value}"
  );
});

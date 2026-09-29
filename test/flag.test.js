import test from "node:test";
import assert from "node:assert/strict";
import { extractFlag } from "../src/flag.js";

test("prefers explicit CTF_RACER_FLAG marker", () => {
  assert.equal(extractFlag("done\nCTF_RACER_FLAG=NADI{abc}\n"), "NADI{abc}");
});

test("falls back to challenge regex", () => {
  assert.equal(extractFlag("candidate NADI{xyz_123}", "NADI\\{[A-Za-z0-9_]+\\}"), "NADI{xyz_123}");
});

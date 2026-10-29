#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const latestPath = path.join(root, "docs/reports/LATEST.md");
const ledgerPath = path.join(root, "docs/EXPERIMENT_LEDGER.jsonl");
if (!fs.existsSync(latestPath) || !fs.existsSync(ledgerPath)) {
  throw new Error("Research records are incomplete; see docs/README.md");
}
const entries = fs.readFileSync(ledgerPath, "utf8").split(/\r?\n/).filter(Boolean).map((line, i) => {
  try { return JSON.parse(line); }
  catch (error) { throw new Error(`Invalid experiment ledger JSON on line ${i + 1}: ${error.message}`); }
});
const report = fs.readFileSync(latestPath, "utf8");
console.log(report.trimEnd());
console.log("\n## Ledger index\n");
if (!entries.length) console.log("No experiments recorded.");
for (const entry of entries) {
  console.log(`- ${entry.experiment_id}: ${entry.status}; attempted=${entry.outcome?.attempted ?? "unknown"}; verified=${entry.outcome?.verified ?? "unknown"}`);
}

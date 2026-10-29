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
const statusCorrections = new Map(entries
  .filter((entry) => entry.status === "CORRECTION" && entry.corrects && entry.corrected_status)
  .map((entry) => [entry.corrects, entry]));
for (const entry of entries) {
  const correction = statusCorrections.get(entry.experiment_id);
  const status = correction ? `${entry.status} -> ${correction.corrected_status} (corrected)` : entry.status;
  const eligibility = correction?.eligible_for_solve_rate === false || correction?.eligible_for_strict_solve_rate === false ? "; solve-rate eligible=false" : "";
  const outcome = correction?.outcome ?? entry.outcome;
  console.log(`- ${entry.experiment_id}: ${status}${eligibility}; attempted=${outcome?.attempted ?? "unknown"}; verified=${outcome?.verified ?? "unknown"}`);
}

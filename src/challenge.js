import fs from "node:fs";
import path from "node:path";

function requiredString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`challenge.json: ${field} must be a non-empty string`);
  }
  return value.trim();
}

export function loadChallenge(sourceDir) {
  const file = path.join(sourceDir, "challenge.json");
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  return {
    ...raw,
    id: requiredString(raw.id, "id"),
    title: requiredString(raw.title, "title"),
    description: requiredString(raw.description, "description"),
  };
}

export function safeChallengeId(id) {
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/-+/g, "-");
  if (!safe || safe === "." || safe === "..") throw new Error("Unsafe challenge id");
  return safe;
}

function normalizeCandidate(value) {
  return typeof value === "string" ? value.trim().replace(/^\`+|\`+$/g, "") : "";
}

function isPlaceholder(candidate, flagFormat) {
  if (!candidate) return true;
  const normalized = candidate.trim();
  if (flagFormat && normalized === flagFormat.trim()) return true;
  if (/\{\s*(?:\.{3,}|…|<[^>]+>|placeholder)\s*\}/i.test(normalized)) return true;
  return false;
}

function matchesConfiguredRegex(candidate, configuredRegex) {
  if (!configuredRegex) return true;
  try {
    return new RegExp(`^(?:${configuredRegex})$`, "m").test(candidate);
  } catch {
    return false;
  }
}

export function extractFlag(response, configuredRegex, flagFormat) {
  const candidates = [];
  const explicit = response.match(/^CTF_RACER_FLAG=(.+)$/m)?.[1];
  if (explicit) candidates.push(normalizeCandidate(explicit));

  if (configuredRegex) {
    try {
      const regex = new RegExp(configuredRegex, "gm");
      for (const match of response.matchAll(regex)) {
        if (match?.[0]) candidates.push(normalizeCandidate(match[0]));
      }
    } catch {
      // Invalid regex should fail closed.
    }
  }

  for (const candidate of [...new Set(candidates)]) {
    if (isPlaceholder(candidate, flagFormat)) continue;
    if (!matchesConfiguredRegex(candidate, configuredRegex)) continue;
    return candidate;
  }
  return undefined;
}

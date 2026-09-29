export function extractFlag(response, configuredRegex) {
  const explicit = response.match(/^CTF_RACER_FLAG=(.+)$/m)?.[1]?.trim();
  if (explicit) return explicit;
  if (configuredRegex) {
    const match = response.match(new RegExp(configuredRegex, "m"));
    if (match?.[0]) return match[0];
  }
  return undefined;
}

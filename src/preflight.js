import fs from "node:fs";
import path from "node:path";

function walkFiles(root) {
  if (!fs.existsSync(root)) return [];
  const out = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function collectStringValues(node, keyName, out = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectStringValues(item, keyName, out);
    return out;
  }
  if (!node || typeof node !== "object") return out;
  for (const [key, value] of Object.entries(node)) {
    if (key.toLowerCase() === keyName.toLowerCase() && typeof value === "string") out.push(value);
    collectStringValues(value, keyName, out);
  }
  return out;
}

function collectNonceCiphertextRecords(node, trail = "$", out = []) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectNonceCiphertextRecords(item, `${trail}[${index}]`, out));
    return out;
  }
  if (!node || typeof node !== "object") return out;

  if (typeof node.nonce === "string" && typeof node.ciphertext === "string") {
    let ciphertextBytes = null;
    try {
      ciphertextBytes = Buffer.from(node.ciphertext, "base64").length;
    } catch {
      ciphertextBytes = null;
    }
    out.push({
      trail,
      nonce: node.nonce,
      sender: typeof node.sender === "string" ? node.sender : null,
      ciphertextBytes,
    });
  }

  for (const [key, value] of Object.entries(node)) {
    collectNonceCiphertextRecords(value, `${trail}.${key}`, out);
  }
  return out;
}

function analyzeJson(file, artifactRoot) {
  const findings = [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return findings;
  }

  const rel = path.relative(artifactRoot, file);
  const ciphers = [...new Set(collectStringValues(parsed, "cipher"))];
  const records = collectNonceCiphertextRecords(parsed);
  const byNonce = new Map();
  for (const record of records) {
    if (!byNonce.has(record.nonce)) byNonce.set(record.nonce, []);
    byNonce.get(record.nonce).push(record);
  }

  for (const [nonce, group] of byNonce.entries()) {
    if (group.length < 2) continue;
    const ctr = ciphers.some((cipher) => /CTR/i.test(cipher));
    findings.push({
      severity: ctr ? "HIGH" : "MEDIUM",
      type: "reused-nonce",
      file: rel,
      title: `${ctr ? "AES-CTR " : ""}nonce reuse detected`,
      evidence: `Nonce ${nonce} is reused by ${group.length} ciphertext records: ${group.map((x) => x.sender ?? x.trail).join(", ")}.`,
      implication: ctr
        ? "CTR nonce reuse means the same keystream is reused under the same key, so C1 XOR C2 = P1 XOR P2. Prioritize crib dragging / known-plaintext recovery before attempting key brute force."
        : "Repeated nonces/IVs may violate the construction's uniqueness requirement. Verify the cipher/mode semantics before deeper attacks.",
      records: group,
    });
  }

  return findings;
}

function renderPreflight(challenge, files, findings) {
  const lines = [
    "# Deterministic preflight",
    "",
    "Generated before the Codex solver starts. Treat findings as machine-collected evidence, not as a substitute for verification.",
    "",
    `- Challenge category: ${challenge.category ?? "unknown"}`,
    `- Artifact count: ${files.length}`,
    "",
    "## Artifact inventory",
    "",
  ];

  if (files.length === 0) lines.push("No artifact files found.");
  for (const file of files) {
    const stat = fs.statSync(file.full);
    lines.push(`- ${file.rel} (${stat.size} bytes)`);
  }

  lines.push("", "## Findings", "");
  if (findings.length === 0) {
    lines.push("No deterministic high-signal finding was produced by the current V1 preflight modules.");
  } else {
    findings.forEach((finding, index) => {
      lines.push(`### ${index + 1}. [${finding.severity}] ${finding.title}`);
      lines.push("");
      lines.push(`- File: ${finding.file}`);
      lines.push(`- Evidence: ${finding.evidence}`);
      lines.push(`- Implication: ${finding.implication}`);
      lines.push("");
    });
  }

  return lines.join("\n") + "\n";
}

export function runPreflight(workspace, challenge) {
  const artifactRoot = path.join(workspace, "artifacts");
  const fullFiles = walkFiles(artifactRoot);
  const files = fullFiles.map((full) => ({ full, rel: path.relative(artifactRoot, full) }));
  const findings = [];

  if (challenge.category === "crypto") {
    for (const file of fullFiles) {
      if (path.extname(file).toLowerCase() === ".json") {
        findings.push(...analyzeJson(file, artifactRoot));
      }
    }
  }

  const markdown = renderPreflight(challenge, files, findings);
  fs.writeFileSync(path.join(workspace, "PREFLIGHT.md"), markdown);

  return {
    findingCount: findings.length,
    highCount: findings.filter((finding) => finding.severity === "HIGH").length,
    findings,
  };
}

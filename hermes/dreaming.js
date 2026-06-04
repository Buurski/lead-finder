// hermes/dreaming.js — the nightly vault sweep (skeleton).
//
// Run on a schedule (~03:00) by Railway cron or a setInterval in index.js. It
// reads the vault via the GitHub API, looks for housekeeping issues, and writes
// ONE calm suggestion note to daily/<date>-dream.md. It only ADDS suggestions —
// it never edits core files (soul.md / claude.md) or deletes anything.
//
// Env: GITHUB_TOKEN, VAULT_REPO (default Buurski/KnowledgeOS).

const REPO = process.env.VAULT_REPO || "Buurski/KnowledgeOS";
const TOKEN = process.env.GITHUB_TOKEN;
const BRANCH = process.env.VAULT_BRANCH || "master";

function gh(pathname) {
  return fetch(`https://api.github.com/repos/${REPO}/${pathname}`, {
    headers: {
      "User-Agent": "hermes-dreaming",
      Accept: "application/vnd.github+json",
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
    },
  });
}

async function listVault() {
  try {
    const res = await gh(`git/trees/${BRANCH}?recursive=1`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.tree || []).filter((t) => t.type === "blob" && t.path.endsWith(".md"));
  } catch {
    return [];
  }
}

async function sweep() {
  if (!TOKEN) {
    console.log("[dreaming] GITHUB_TOKEN not set — see SETUP_HERMES.md. Skipping.");
    return;
  }
  const notes = await listVault();
  const findings = [];

  // Cheap heuristics (extend over time):
  const kunder = notes.filter((n) => n.path.startsWith("wiki/kunder/"));
  if (kunder.length === 0) findings.push("Ingen kunde-noter i wiki/kunder/ endnu.");
  const daily = notes.filter((n) => n.path.startsWith("daily/"));
  if (daily.length > 0) {
    const latest = daily.map((d) => d.path).sort().pop();
    findings.push(`Seneste daglige note: ${latest}.`);
  }
  findings.push(`Vaulten har ${notes.length} markdown-noter.`);

  const date = new Date().toISOString().slice(0, 10);
  const body = [
    `# Nat-drøm — ${date}`,
    ``,
    `Hermes kiggede vaulten igennem i nat. Forslag (ikke ændringer):`,
    ``,
    ...findings.map((f) => `- ${f}`),
    ``,
    `> Jeg ændrer aldrig soul.md/claude.md selv. Det her er bare et nudge.`,
  ].join("\n");

  // In a real deploy this PUTs daily/<date>-dream.md via the GitHub contents API.
  // Left as a log in the skeleton so nothing is written before Lucas wires it.
  console.log(`[dreaming] would write daily/${date}-dream.md:\n${body}`);
}

sweep();

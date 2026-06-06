// vault.ts — the bridge to the KnowledgeOS second brain.
//
// Reads markdown notes local-first (the in-repo KnowledgeOS/ mirror) and falls
// back to the GitHub raw endpoint for Buurski/KnowledgeOS. Both are best-effort:
// a missing file / private repo / no network yields ok:false with a reason, so
// every screen can show a calm amber fallback instead of crashing.
//
// Token-discipline: we read ONE note at a time (never the whole vault), and a
// small in-memory TTL cache (5 min) keeps repeat reads cheap. Listing walks the
// local mirror; the remote tree is only attempted when local is empty.

import fs from "node:fs";
import path from "node:path";

const REPO = "Buurski/KnowledgeOS";
const BRANCH = process.env.VAULT_BRANCH || "master";
const LOCAL_ROOT = path.join(process.cwd(), "KnowledgeOS");
const TTL_MS = 5 * 60 * 1000;

export interface VaultNote {
  ok: boolean;
  pathRel: string;
  source: "local" | "remote" | "none";
  frontmatter: Record<string, string>;
  body: string;
  raw: string;
  reason?: string;
}

export interface VaultEntry {
  pathRel: string;
  title: string;
  source: "local" | "remote";
}

const cache = new Map<string, { at: number; value: VaultNote }>();

function ghHeaders(): Record<string, string> {
  const t = process.env.GITHUB_TOKEN || process.env.VAULT_GITHUB_TOKEN;
  return t ? { Authorization: `Bearer ${t}`, "User-Agent": "command-center" } : { "User-Agent": "command-center" };
}

export function parseFrontmatter(md: string): { frontmatter: Record<string, string>; body: string } {
  // Normalize CRLF/CR → LF first. On Windows the vault notes get CRLF endings
  // (git autocrlf), and a `^---\n` match would otherwise fail → frontmatter
  // silently lost (titles, dates). This is also what makes journal notes parse.
  const src = (md || "").replace(/\r\n?/g, "\n");
  const m = src.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: src };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) fm[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { frontmatter: fm, body: m[2] };
}

function safeRel(rel: string): string {
  // prevent path traversal out of the vault
  return rel.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\.\.(\/|$)/g, "");
}

async function readRemote(rel: string): Promise<string | null> {
  try {
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${rel}`;
    const res = await fetch(url, { headers: ghHeaders(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export async function readVaultNote(relInput: string): Promise<VaultNote> {
  const rel = safeRel(relInput.endsWith(".md") ? relInput : relInput + ".md");
  const cached = cache.get(rel);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  let raw: string | null = null;
  let source: VaultNote["source"] = "none";

  // local-first
  try {
    const local = path.join(LOCAL_ROOT, rel);
    if (local.startsWith(LOCAL_ROOT) && fs.existsSync(local)) {
      raw = fs.readFileSync(local, "utf-8");
      source = "local";
    }
  } catch {
    /* ignore */
  }

  // remote fallback
  if (raw == null) {
    const remote = await readRemote(rel);
    if (remote != null) {
      raw = remote;
      source = "remote";
    }
  }

  let value: VaultNote;
  if (raw == null) {
    value = { ok: false, pathRel: rel, source: "none", frontmatter: {}, body: "", raw: "", reason: "ikke fundet lokalt eller i Buurski/KnowledgeOS" };
  } else {
    const { frontmatter, body } = parseFrontmatter(raw);
    value = { ok: true, pathRel: rel, source, frontmatter, body, raw };
  }
  cache.set(rel, { at: Date.now(), value });
  return value;
}

function titleFrom(rel: string, raw?: string): string {
  if (raw) {
    const h1 = raw.match(/^#\s+(.+)$/m);
    if (h1) return h1[1].trim();
  }
  const base = rel.split("/").pop() || rel;
  return base.replace(/\.md$/, "").replace(/[-_]/g, " ");
}

function walkLocal(prefixRel: string): VaultEntry[] {
  const root = path.join(LOCAL_ROOT, safeRel(prefixRel));
  const out: VaultEntry[] = [];
  if (!root.startsWith(LOCAL_ROOT) || !fs.existsSync(root)) return out;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.name.endsWith(".md")) {
        const rel = path.relative(LOCAL_ROOT, full).replace(/\\/g, "/");
        out.push({ pathRel: rel, title: titleFrom(rel), source: "local" });
      }
    }
  }
  return out.sort((a, b) => a.pathRel.localeCompare(b.pathRel));
}

async function listRemote(prefixRel: string): Promise<VaultEntry[]> {
  try {
    const url = `https://api.github.com/repos/${REPO}/git/trees/${BRANCH}?recursive=1`;
    const res = await fetch(url, { headers: ghHeaders(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = (await res.json()) as { tree?: Array<{ path: string; type: string }> };
    const prefix = safeRel(prefixRel);
    return (data.tree ?? [])
      .filter((t) => t.type === "blob" && t.path.endsWith(".md") && t.path.startsWith(prefix))
      .map((t) => ({ pathRel: t.path, title: titleFrom(t.path), source: "remote" as const }));
  } catch {
    return [];
  }
}

export async function listVault(prefixRel = ""): Promise<{ source: "local" | "remote" | "none"; entries: VaultEntry[] }> {
  const local = walkLocal(prefixRel);
  if (local.length) return { source: "local", entries: local };
  const remote = await listRemote(prefixRel);
  if (remote.length) return { source: "remote", entries: remote };
  return { source: "none", entries: [] };
}

export function vaultStatus(): { localRoot: string; hasLocal: boolean; repo: string; branch: string; tokenSet: boolean } {
  let hasLocal = false;
  try {
    hasLocal = fs.existsSync(LOCAL_ROOT) && fs.readdirSync(LOCAL_ROOT).length > 0;
  } catch {
    /* ignore */
  }
  return {
    localRoot: "KnowledgeOS/",
    hasLocal,
    repo: REPO,
    branch: BRANCH,
    tokenSet: Boolean(process.env.GITHUB_TOKEN || process.env.VAULT_GITHUB_TOKEN),
  };
}

export interface VaultLive {
  live: boolean;
  reason: "ok" | "no-token" | "unauthorized" | "not-found" | "network" | "rate-limited";
  detail: string;
}

// Authenticated reachability check against the GitHub repo. Distinguishes a
// good token from an expired one (401) and a missing repo (404). Used by the UI
// to show "Vault: live" vs "lokal seed" vs "token udløbet".
export async function vaultLiveCheck(): Promise<VaultLive> {
  if (!(process.env.GITHUB_TOKEN || process.env.VAULT_GITHUB_TOKEN)) {
    return { live: false, reason: "no-token", detail: "Ingen GITHUB_TOKEN — læser kun lokal seed." };
  }
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 401) return { live: false, reason: "unauthorized", detail: "Token afvist (401) — sandsynligvis udløbet." };
    if (res.status === 403) return { live: false, reason: "rate-limited", detail: "GitHub rate-limit (403)." };
    if (res.status === 404) return { live: false, reason: "not-found", detail: `Repo ${REPO} ikke fundet (404).` };
    if (!res.ok) return { live: false, reason: "network", detail: `GitHub svarede ${res.status}.` };
    return { live: true, reason: "ok", detail: `Forbundet til ${REPO}.` };
  } catch (err) {
    return { live: false, reason: "network", detail: `Kunne ikke nå GitHub: ${String(err).slice(0, 80)}` };
  }
}

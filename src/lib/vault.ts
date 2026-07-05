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
  const token = process.env.GITHUB_TOKEN || process.env.VAULT_GITHUB_TOKEN;
  // PRIVATE repos: raw.githubusercontent.com ignores the Authorization header and
  // 404s, so when we have a token use the contents API with the raw media type —
  // that works for private repos. Public/no-token falls back to the raw host.
  if (token) {
    try {
      const url = `https://api.github.com/repos/${REPO}/contents/${rel.split("/").map(encodeURIComponent).join("/")}?ref=${BRANCH}`;
      const res = await fetch(url, {
        headers: { ...ghHeaders(), Accept: "application/vnd.github.raw" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return await res.text();
    } catch {
      /* fall through to raw host */
    }
  }
  try {
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${rel}`;
    const res = await fetch(url, { headers: ghHeaders(), signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// writeVaultNote — commit a note to the LIVE vault (GitHub contents API).
// The remote repo is the sync hub (Obsidian Git pulls it, the VPS clone pulls
// it), so writes go there — never to the stale in-repo mirror. Best-effort:
// returns ok:false with a reason instead of throwing, like the readers.
export async function writeVaultNote(
  relInput: string,
  content: string,
  message: string,
): Promise<{ ok: boolean; reason?: string }> {
  const token = process.env.GITHUB_TOKEN || process.env.VAULT_GITHUB_TOKEN;
  if (!token) return { ok: false, reason: "GITHUB_TOKEN mangler — kan ikke skrive til vaulten" };
  const rel = safeRel(relInput.endsWith(".md") ? relInput : relInput + ".md");
  const url = `https://api.github.com/repos/${REPO}/contents/${rel.split("/").map(encodeURIComponent).join("/")}`;
  try {
    // current sha (required by the contents API when updating an existing file)
    let sha: string | undefined;
    const head = await fetch(`${url}?ref=${BRANCH}`, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    if (head.ok) {
      const meta = (await head.json()) as { sha?: string };
      sha = meta.sha;
    }
    const res = await fetch(url, {
      method: "PUT",
      headers: { ...ghHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        content: Buffer.from(content, "utf-8").toString("base64"),
        branch: BRANCH,
        ...(sha ? { sha } : {}),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { ok: false, reason: `GitHub svarede ${res.status}: ${detail.slice(0, 160)}` };
    }
    // bust the read cache so the next read sees the new content
    cache.delete("r:" + rel);
    cache.delete("l:" + rel);
    return { ok: true };
  } catch {
    return { ok: false, reason: "netværksfejl mod GitHub" };
  }
}

// readVaultNote options.
//   preferRemote — try the live GitHub vault FIRST, local mirror only as offline
//   fallback. Used for daily/ notes: the in-repo mirror is a stale snapshot, so
//   local-first would shadow the live note Lucas's Obsidian Git pushes each day.
export async function readVaultNote(
  relInput: string,
  opts: { preferRemote?: boolean } = {},
): Promise<VaultNote> {
  const rel = safeRel(relInput.endsWith(".md") ? relInput : relInput + ".md");
  const cacheKey = (opts.preferRemote ? "r:" : "l:") + rel;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;

  let raw: string | null = null;
  let source: VaultNote["source"] = "none";

  const tryLocal = (): boolean => {
    try {
      const local = path.join(LOCAL_ROOT, rel);
      if (local.startsWith(LOCAL_ROOT) && fs.existsSync(local)) {
        raw = fs.readFileSync(local, "utf-8");
        source = "local";
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  };
  const tryRemote = async (): Promise<boolean> => {
    const remote = await readRemote(rel);
    if (remote != null) {
      raw = remote;
      source = "remote";
      return true;
    }
    return false;
  };

  if (opts.preferRemote) {
    if (!(await tryRemote())) tryLocal();
  } else {
    if (!tryLocal()) await tryRemote();
  }

  let value: VaultNote;
  if (raw == null) {
    value = { ok: false, pathRel: rel, source: "none", frontmatter: {}, body: "", raw: "", reason: "ikke fundet lokalt eller i Buurski/KnowledgeOS" };
  } else {
    const { frontmatter, body } = parseFrontmatter(raw);
    value = { ok: true, pathRel: rel, source, frontmatter, body, raw };
  }
  cache.set(cacheKey, { at: Date.now(), value });
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

export async function listVault(
  prefixRel = "",
  opts: { preferRemote?: boolean } = {},
): Promise<{ source: "local" | "remote" | "none"; entries: VaultEntry[] }> {
  if (opts.preferRemote) {
    // Live vault first (daily/): the in-repo mirror is a stale snapshot.
    const remote = await listRemote(prefixRel);
    if (remote.length) return { source: "remote", entries: remote };
    const local = walkLocal(prefixRel);
    if (local.length) return { source: "local", entries: local };
    return { source: "none", entries: [] };
  }
  const local = walkLocal(prefixRel);
  if (local.length) return { source: "local", entries: local };
  const remote = await listRemote(prefixRel);
  if (remote.length) return { source: "remote", entries: remote };
  return { source: "none", entries: [] };
}

// Read a JSON data file from the vault (e.g. data/inbox.json) that a Cowork task
// wrote + pushed. Remote-first (live) by default with the in-repo mirror as offline
// fallback — same idea as daily notes, but for structured artifacts the app shows
// (inbox digest, lead-gen run, messenger candidates). Returns null on any failure.
const jsonCache = new Map<string, { at: number; value: unknown }>();
const JSON_TTL_MS = 90 * 1000;

export async function readVaultJson<T = unknown>(relInput: string, opts: { preferRemote?: boolean } = {}): Promise<T | null> {
  const preferRemote = opts.preferRemote ?? true;
  const rel = safeRel(relInput);

  const cached = jsonCache.get(rel);
  if (cached && Date.now() - cached.at < JSON_TTL_MS) return cached.value as T | null;

  const tryLocal = (): string | null => {
    try {
      const local = path.join(LOCAL_ROOT, rel);
      if (local.startsWith(LOCAL_ROOT) && fs.existsSync(local)) return fs.readFileSync(local, "utf-8");
    } catch {
      /* ignore */
    }
    return null;
  };

  let raw: string | null = null;
  if (preferRemote) {
    raw = await readRemote(rel);
    if (raw == null) raw = tryLocal();
  } else {
    raw = tryLocal();
    if (raw == null) raw = await readRemote(rel);
  }
  let value: T | null = null;
  if (raw != null) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = null;
    }
  }
  jsonCache.set(rel, { at: Date.now(), value });
  return value;
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

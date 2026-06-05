// store.ts — storage abstraction so the app works on Vercel's ephemeral
// filesystem. Locally (and in tests) it's the same `.send_queue/` + `dist/`
// files as before (FSStore). On Vercel it routes docs/logs to Vercel KV and
// served assets to Vercel Blob. One async interface; drivers are swappable.
//
// Strip-safe: @vercel/kv and @vercel/blob are LAZY dynamic imports, so the
// node engine CLI and the offline tests (FSStore default) never load them.

import fs from "node:fs";
import path from "node:path";

export interface PutAssetResult {
  url: string;
  key: string;
}

export interface Store {
  // append-only logs (e.g. spend.jsonl)
  append(key: string, entry: unknown): Promise<void>;
  readAll(key: string): Promise<unknown[]>;
  // documents (json)
  get<T = unknown>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
  // served assets (html, images)
  putAsset(key: string, content: string | Uint8Array, contentType: string): Promise<PutAssetResult>;
  getAssetUrl(key: string): Promise<string | null>;
  deleteAsset(key: string): Promise<void>;
}

// Preserve the exact legacy file locations so nothing else observes a change.
const FS_ALIASES: Record<string, string> = {
  queue: ".send_queue/approval_queue.json",
  settings: ".send_queue/settings.json",
};

function fsDocPath(key: string): string {
  if (FS_ALIASES[key]) return path.join(process.cwd(), FS_ALIASES[key]);
  if (/\.(json|md|html|txt)$/.test(key)) return path.join(process.cwd(), key);
  // recon/{slug} -> client-assets/{slug}/recon.json
  if (key.startsWith("recon/")) return path.join(process.cwd(), "client-assets", key.slice("recon/".length), "recon.json");
  return path.join(process.cwd(), ".send_queue", `${key}.json`);
}
function fsLogPath(key: string): string {
  return path.join(process.cwd(), ".send_queue", `${key}.jsonl`);
}
function fsAssetPath(key: string): string {
  return path.join(process.cwd(), "dist", key);
}

export class FSStore implements Store {
  async append(key: string, entry: unknown): Promise<void> {
    const file = fsLogPath(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + "\n", "utf-8");
  }
  async readAll(key: string): Promise<unknown[]> {
    try {
      return fs.readFileSync(fsLogPath(key), "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    } catch {
      return [];
    }
  }
  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      return JSON.parse(fs.readFileSync(fsDocPath(key), "utf-8")) as T;
    } catch {
      return null;
    }
  }
  async put(key: string, value: unknown): Promise<void> {
    const file = fsDocPath(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf-8");
  }
  async delete(key: string): Promise<void> {
    try {
      fs.rmSync(fsDocPath(key));
    } catch {
      /* already gone */
    }
  }
  async list(prefix: string): Promise<string[]> {
    const dir = path.join(process.cwd(), ".send_queue");
    try {
      return fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).map((f) => f.replace(/\.(json|jsonl)$/, ""));
    } catch {
      return [];
    }
  }
  async putAsset(key: string, content: string | Uint8Array, contentType: string): Promise<PutAssetResult> {
    void contentType; // FS writes don't need the MIME type; Blob does.
    const file = fsAssetPath(key);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return { url: `/_assets/${key}`, key }; // local pseudo-URL; served from dist/ in dev
  }
  async getAssetUrl(key: string): Promise<string | null> {
    return fs.existsSync(fsAssetPath(key)) ? `/_assets/${key}` : null;
  }
  async deleteAsset(key: string): Promise<void> {
    try {
      fs.rmSync(fsAssetPath(key));
    } catch {
      /* already gone */
    }
  }
}

// In-memory driver for tests (no IO).
export class InMemoryStore implements Store {
  private logs = new Map<string, unknown[]>();
  private docs = new Map<string, unknown>();
  private assets = new Map<string, { content: string | Uint8Array; url: string }>();
  async append(key: string, entry: unknown) { (this.logs.get(key) ?? this.logs.set(key, []).get(key)!).push(entry); }
  async readAll(key: string) { return [...(this.logs.get(key) ?? [])]; }
  async get<T = unknown>(key: string) { return (this.docs.has(key) ? (this.docs.get(key) as T) : null); }
  async put(key: string, value: unknown) { this.docs.set(key, value); }
  async delete(key: string) { this.docs.delete(key); }
  async list(prefix: string) { return [...this.docs.keys()].filter((k) => k.startsWith(prefix)); }
  async putAsset(key: string, content: string | Uint8Array): Promise<PutAssetResult> {
    const url = `mem://${key}`;
    this.assets.set(key, { content, url });
    return { url, key };
  }
  async getAssetUrl(key: string) { return this.assets.get(key)?.url ?? null; }
  async deleteAsset(key: string) { this.assets.delete(key); }
}

// Vercel KV driver (docs + logs). Lazy import so FS/node never loads it.
class KVStore implements Store {
  private async kv() {
    const mod = await import("@vercel/kv" as string);
    return mod.kv;
  }
  async append(key: string, entry: unknown) { const kv = await this.kv(); await kv.rpush(`log:${key}`, JSON.stringify(entry)); }
  async readAll(key: string) {
    const kv = await this.kv();
    const items = (await kv.lrange(`log:${key}`, 0, -1)) as unknown[];
    return items.map((i) => (typeof i === "string" ? JSON.parse(i) : i));
  }
  async get<T = unknown>(key: string) { const kv = await this.kv(); return ((await kv.get(`doc:${key}`)) as T) ?? null; }
  async put(key: string, value: unknown) { const kv = await this.kv(); await kv.set(`doc:${key}`, value); }
  async delete(key: string) { const kv = await this.kv(); await kv.del(`doc:${key}`); }
  async list(prefix: string) {
    // SCAN cursor loop — never KEYS (KEYS blocks the Redis event loop in
    // production; flagged by the QA council). Pages through with a cursor.
    const kv = await this.kv();
    const out: string[] = [];
    let cursor = 0;
    do {
      const [next, batch] = (await kv.scan(cursor, { match: `doc:${prefix}*`, count: 200 })) as [number, string[]];
      for (const k of batch) out.push(k.replace(/^doc:/, ""));
      cursor = Number(next);
    } while (cursor !== 0);
    return out;
  }
  async putAsset(): Promise<PutAssetResult> { throw new Error("KVStore does not serve assets — use ComposedStore"); }
  async getAssetUrl() { return null; }
  async deleteAsset() { /* n/a */ }
}

// Vercel Blob driver (assets only). Lazy import.
class BlobStore {
  private async blob() {
    return await import("@vercel/blob" as string);
  }
  async putAsset(key: string, content: string | Uint8Array, contentType: string): Promise<PutAssetResult> {
    const { put } = await this.blob();
    const res = await put(key, content, { access: "public", contentType, addRandomSuffix: false });
    return { url: res.url, key };
  }
  async getAssetUrl(key: string): Promise<string | null> {
    try {
      const { head } = await this.blob();
      const h = await head(key);
      return h?.url ?? null;
    } catch {
      return null;
    }
  }
  async deleteAsset(key: string): Promise<void> {
    try {
      const { del } = await this.blob();
      await del(key);
    } catch {
      /* ignore */
    }
  }
}

// Routes assets to Blob, everything else to KV.
class ComposedStore implements Store {
  private kv = new KVStore();
  private blob = new BlobStore();
  append(key: string, entry: unknown) { return this.kv.append(key, entry); }
  readAll(key: string) { return this.kv.readAll(key); }
  get<T = unknown>(key: string) { return this.kv.get<T>(key); }
  put(key: string, value: unknown) { return this.kv.put(key, value); }
  delete(key: string) { return this.kv.delete(key); }
  list(prefix: string) { return this.kv.list(prefix); }
  putAsset(key: string, content: string | Uint8Array, contentType: string) { return this.blob.putAsset(key, content, contentType); }
  getAssetUrl(key: string) { return this.blob.getAssetUrl(key); }
  deleteAsset(key: string) { return this.blob.deleteAsset(key); }
}

let _store: Store | null = null;

export function createStore(): Store {
  if (_store) return _store;
  const driver = (process.env.STORE_DRIVER || "").toLowerCase();
  if (driver === "fs") _store = new FSStore();
  else if (driver === "memory") _store = new InMemoryStore();
  else if (driver === "kv" || driver === "cloud") _store = new ComposedStore();
  // Auto: on Vercel with KV configured, use cloud; otherwise FS (local/dev/tests).
  else if (process.env.VERCEL && process.env.KV_REST_API_URL) _store = new ComposedStore();
  else _store = new FSStore();
  return _store;
}

function active(): Store {
  return _store ?? createStore();
}

// For tests: swap in a driver. Because `store` below delegates at call time, the
// swap is seen by every module that imported `store` (even those imported first).
export function __setStore(s: Store | null): void {
  _store = s;
}

// A stable facade that always delegates to the current driver. Importing this
// const never pins a specific driver instance.
export const store: Store = {
  append: (k, e) => active().append(k, e),
  readAll: (k) => active().readAll(k),
  get: (k) => active().get(k),
  put: (k, v) => active().put(k, v),
  delete: (k) => active().delete(k),
  list: (p) => active().list(p),
  putAsset: (k, c, t) => active().putAsset(k, c, t),
  getAssetUrl: (k) => active().getAssetUrl(k),
  deleteAsset: (k) => active().deleteAsset(k),
};

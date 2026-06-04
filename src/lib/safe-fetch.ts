// safe-fetch.ts — SSRF-safe HTTP fetcher for any outbound request that takes
// a user-influenced URL (customer-recon, vault remote-read, AI-visibility
// probe, etc).
//
// Designed per Block 6 (Security council). Edge-runtime compatible — no Node
// `dns` module; DNS validation goes through Cloudflare's DoH endpoint.
//
//   const r = await safeFetch("https://example.com/", { timeoutMs: 9000 });
//   if (!r) return null;
//   const html = new TextDecoder("utf-8").decode(r.bytes);
//
// Guards:
//   1. Protocol allowlist: http/https only.
//   2. Hostname/IP blocklist: private ranges, link-local, loopback,
//      cloud metadata endpoints.
//   3. DNS-resolution check (via Cloudflare DoH) — catches hostnames that
//      resolve to private IPs.
//   4. Manual redirect handling (max 3) with TOCTOU defense — every hop
//      re-validates the new target host.
//   5. Response-size cap (default 2 MB) — read in chunks, abort on exceed.
//   6. Timeout cap (default 9 s) via AbortSignal.timeout.

const PRIVATE_V4_PATTERNS = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
  // Carrier-grade NAT 100.64.0.0/10
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
];

const PRIVATE_V6_PATTERNS = [
  /^::1$/i,        // loopback
  /^fe80:/i,       // link-local
  /^fc/i,          // unique-local
  /^fd/i,          // unique-local
  /^::ffff:127\./i, // IPv4-mapped loopback
  /^::ffff:10\./i,  // IPv4-mapped private
];

const CLOUD_META_HOSTS = new Set([
  "169.254.169.254",          // AWS / Azure / DO
  "metadata.google.internal", // GCP
  "metadata.goog",
  "fd00:ec2::254",            // AWS IPv6
  "100.100.100.200",          // Alibaba Cloud
]);

const DEFAULT_TIMEOUT_MS = 9000;
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 3;
const REALISTIC_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export class SsrfBlockedError extends Error {
  constructor(reason: string) {
    super(`safe-fetch blocked: ${reason}`);
    this.name = "SsrfBlockedError";
  }
}

function isPrivateIp(host: string): boolean {
  if (PRIVATE_V4_PATTERNS.some((r) => r.test(host))) return true;
  if (host.includes(":") && PRIVATE_V6_PATTERNS.some((r) => r.test(host))) return true;
  return false;
}

function isCloudMetadata(host: string): boolean {
  return CLOUD_META_HOSTS.has(host.toLowerCase());
}

function looksLikeRawIp(host: string): boolean {
  // IPv4 dotted-quad
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  // IPv6 — contains ":" but not "."
  if (host.includes(":") && !host.includes(".")) return true;
  return false;
}

async function validateHost(host: string): Promise<void> {
  // Strip IPv6 brackets so "[::1]" is normalised to "::1" before the checks.
  const lower = host.toLowerCase().replace(/^\[|\]$/g, "");

  if (isCloudMetadata(lower)) {
    throw new SsrfBlockedError(`cloud metadata host (${lower})`);
  }

  // Reject explicit loopback / unspecified (incl. IPv6 loopback ::1).
  if (lower === "localhost" || lower === "0.0.0.0" || lower === "::" || lower === "::1" || lower === "0:0:0:0:0:0:0:1") {
    throw new SsrfBlockedError(`loopback hostname (${lower})`);
  }

  // Reject literal-IP private targets immediately.
  if (looksLikeRawIp(lower) && isPrivateIp(lower)) {
    throw new SsrfBlockedError(`private ip literal (${lower})`);
  }

  // DNS check via DoH. Best-effort — if DoH itself is down, we still allow
  // (the host/literal checks above already caught the obvious cases).
  try {
    const r = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(lower)}&type=A`,
      {
        headers: { Accept: "application/dns-json" },
        signal: AbortSignal.timeout(2500),
      },
    );
    if (!r.ok) return;
    const j = (await r.json()) as { Answer?: Array<{ data?: string; type?: number }> };
    for (const a of j.Answer ?? []) {
      const data = (a.data ?? "").trim();
      if (!data) continue;
      if (isPrivateIp(data) || isCloudMetadata(data)) {
        throw new SsrfBlockedError(`resolves to private (${lower} -> ${data})`);
      }
    }
  } catch (e) {
    if (e instanceof SsrfBlockedError) throw e;
    // DoH failure is non-fatal.
  }
}

export interface SafeFetchOpts {
  timeoutMs?: number;
  maxBytes?: number;
  /** If set, only allow these hostnames (after normalisation). */
  allowedHosts?: string[];
  /** Extra headers to send (User-Agent and Accept are set automatically). */
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  status: number;
  bytes: Uint8Array;
  finalUrl: string;
  headers: Headers;
}

export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOpts = {},
): Promise<SafeFetchResult | null> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const allowedHosts = opts.allowedHosts?.map((h) => h.toLowerCase());

  let currentUrl: URL;
  try {
    currentUrl = new URL(rawUrl);
  } catch {
    return null;
  }

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      throw new SsrfBlockedError(`protocol not allowed (${currentUrl.protocol})`);
    }
    const host = currentUrl.hostname.toLowerCase();
    if (allowedHosts && !allowedHosts.includes(host)) {
      throw new SsrfBlockedError(`host not in allowlist (${host})`);
    }
    await validateHost(host);

    const headers: Record<string, string> = {
      "User-Agent": REALISTIC_UA,
      Accept: "text/html,application/xhtml+xml,application/xml,*/*;q=0.8",
      ...(opts.headers ?? {}),
    };

    let res: Response;
    try {
      res = await fetch(currentUrl.href, {
        redirect: "manual",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return null;
      throw err;
    }

    // Manual redirect handling: re-validate the new host (TOCTOU defense).
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return null;
      try {
        currentUrl = new URL(loc, currentUrl);
      } catch {
        return null;
      }
      continue;
    }

    // Read body in chunks, abort on size overrun.
    if (!res.body) {
      return { status: res.status, bytes: new Uint8Array(), finalUrl: currentUrl.href, headers: res.headers };
    }
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel();
          throw new SsrfBlockedError(`response exceeds ${maxBytes} bytes`);
        }
        chunks.push(value);
      }
    } finally {
      try { reader.releaseLock(); } catch { /* noop */ }
    }
    const merged = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.byteLength;
    }
    return { status: res.status, bytes: merged, finalUrl: currentUrl.href, headers: res.headers };
  }

  throw new SsrfBlockedError("too many redirects");
}

/** Convenience: decode response as UTF-8 string (returns null on block/error). */
export async function safeFetchText(rawUrl: string, opts: SafeFetchOpts = {}): Promise<string | null> {
  try {
    const r = await safeFetch(rawUrl, opts);
    if (!r || r.status >= 400) return null;
    return new TextDecoder("utf-8").decode(r.bytes);
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      console.warn(JSON.stringify({ evt: "recon.blocked", url: rawUrl, reason: err.message }));
      return null;
    }
    throw err;
  }
}

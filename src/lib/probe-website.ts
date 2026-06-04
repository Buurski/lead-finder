// probe-website.ts — quick, safe liveness/age probe of a lead's website, for the
// validation pass. Distinguishes dead (4xx/5xx/unreachable) from slow (>3s) and
// old (last-modified > 12 months), and flags bot-blocked (403/429 to a real
// browser UA — worth a human look, not a hard "dead"). Routed through safeFetch
// so SSRF guards apply (private IPs, cloud metadata, size cap, redirect limits).

import { safeFetch, SsrfBlockedError } from "./safe-fetch.ts";

export type ProbeStatus = "ok" | "old" | "slow" | "dead" | "blocked" | "no-url";

export interface ProbeResult {
  status: ProbeStatus;
  httpCode?: number;
  responseMs?: number;
  lastModified?: string;
  finalUrl?: string;
}

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

function normalizeUrl(raw: string): string | null {
  const u = (raw || "").trim();
  if (!u) return null;
  const withScheme = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    return new URL(withScheme).href;
  } catch {
    return null;
  }
}

export async function probeWebsite(rawUrl: string, opts: { timeoutMs?: number; slowMs?: number } = {}): Promise<ProbeResult> {
  const url = normalizeUrl(rawUrl);
  if (!url) return { status: "no-url" };

  const timeoutMs = opts.timeoutMs ?? 3500;
  const slowMs = opts.slowMs ?? 3000;

  const t0 = Date.now();
  let res;
  try {
    res = await safeFetch(url, { timeoutMs, maxBytes: 4096, headers: { "User-Agent": BROWSER_UA } });
  } catch (err) {
    if (err instanceof SsrfBlockedError) return { status: "dead" };
    return { status: "dead" };
  }
  const responseMs = Date.now() - t0;

  if (!res) return { status: "dead", responseMs };

  const code = res.status;
  const lastModified = res.headers.get("last-modified") || undefined;
  const finalUrl = res.finalUrl;

  // Bot-blocked: a real browser UA still got 403/429 — likely Cloudflare/WAF,
  // not actually dead. Worth a human look.
  if (code === 403 || code === 429) return { status: "blocked", httpCode: code, responseMs, finalUrl };
  if (code >= 400) return { status: "dead", httpCode: code, responseMs, finalUrl };

  if (responseMs > slowMs) return { status: "slow", httpCode: code, responseMs, lastModified, finalUrl };

  if (lastModified) {
    const lm = Date.parse(lastModified);
    if (!Number.isNaN(lm) && Date.now() - lm > TWELVE_MONTHS_MS) {
      return { status: "old", httpCode: code, responseMs, lastModified, finalUrl };
    }
  }

  return { status: "ok", httpCode: code, responseMs, lastModified, finalUrl };
}

// Hermes WebUI proxy — Next.js route der reverse-proxy'er til cloudflare-tunnelen.
// Bruges af eksterne klienter (curl, scripts) — selve iframen er flyttet til
// server-side fetch i src/app/hermes/page.tsx for at omgå Vercel bot-protection.
//
// CSP headeren fjernes fra upstream-svaret (WebUI sender `frame-ancestors 'none'`
// som ellers blokerer iframen — proxy'en sidder på samme origin som lead-system,
// så frame-ancestors er irrelevant her).
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UPSTREAM_TIMEOUT_MS = 30_000;

function upstreamBase(): string {
  const url = (process.env.HERMES_WEBUI_URL ?? "").trim();
  if (!url) throw new Error("HERMES_WEBUI_URL ikke sat");
  return url.replace(/\/+$/, "");
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path?: string[] }> }) {
  const { path } = await ctx.params;
  const subPath = (path ?? []).join("/");
  let base: string;
  try {
    base = upstreamBase();
  } catch {
    return NextResponse.json(
      { ok: false, error: "WebUI-URL ikke konfigureret — kør cloudflare-rotation" },
      { status: 503 },
    );
  }

  const search = req.nextUrl.search;
  const targetUrl = `${base}/${subPath}${search}`;

  // Byg upstream-headers — fjern host + tilføj korrekt origin
  const headers = new Headers(req.headers);
  headers.delete("host");
  headers.delete("x-forwarded-for");
  headers.delete("x-forwarded-proto");
  headers.set("origin", base);
  headers.set("referer", `${base}/`);

  let body: ArrayBuffer | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      const buf = await req.arrayBuffer();
      body = buf.byteLength > 0 ? buf : undefined;
    } catch {
      body = undefined;
    }
  }

  const ac = new AbortController();
  const timeout = setTimeout(() => ac.abort(), UPSTREAM_TIMEOUT_MS);

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
      signal: ac.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: `upstream fejl: ${msg}` },
      { status: 502 },
    );
  }
  clearTimeout(timeout);

  // Kopiér response-headers, men strip CSP + frame-ancestors (vi er samme origin nu)
  const outHeaders = new Headers(upstream.headers);
  outHeaders.delete("content-security-policy");
  outHeaders.delete("content-security-policy-report-only");
  outHeaders.delete("x-frame-options");
  // Sørg for at browseren må indlejre os
  outHeaders.set("x-frame-options", "SAMEORIGIN");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
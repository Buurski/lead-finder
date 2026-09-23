import { NextResponse, type NextRequest } from "next/server";
import {
  CC_AUTH_HEADER,
  CC_USER_HEADER,
  SESSION_COOKIE,
  SESSION_TTL_S,
  ccAuthMarker,
  issueSession,
  verifySession,
} from "@/lib/cc-auth";
import { RL_BLOCK_S, clientIp, rateLimitCheck } from "@/lib/auth/rate-limit";
import { personFromSessionUser } from "@/lib/auth/magic-session";

// Proxy (Next 16's renamed middleware) — shared-password access for Lucas +
// Charlie (one code, same access).
//
// Hardened in Block 6 (Security council):
//  - Constant-time comparison (Edge-safe, no Node `timingSafeEqual`).
//  - Correct Basic parsing — splits on FIRST colon, decodes as UTF-8.
//  - HMAC-signed session cookie (12h sliding) so the browser stops sending
//    the password on every request after the first success.
//  - Per-IP rate limit via Vercel KV REST API (5 attempts / 60s → 1h block).
//  - Structured logging of failed attempts (no credential bytes).
//
// Auth er OPT-IN LOKALT: mangler VERCEL_BASIC_AUTH_USER/PASS/AUTH_SESSION_SECRET,
// går alt igennem (lokal dev, tests). På Vercel (preview + production) fejler den
// i stedet LUKKET — 22/9 viste preview-deploys at stå åbne for alle med URL'en,
// fordi USER kun var sat i Production-env, mens KV/Sheets-nøglerne også lå i Preview.

export const config = {
  // Run on everything except Next internals, the health check, and static files.
  // api/hermes/status er også undtaget: ren health-info (ingen hemmeligheder),
  // og den SKAL kunne tjekkes udefra når VPS-forbindelsen fejlsøges.
  // seo-tjek er den offentlige lead-magnet-tragt: formular + rapport + afmeld
  // skal kunne nås af fremmede uden kodeord. Stats-endpointet (api/seo-tjek/stats)
  // matcher IKKE undtagelserne og forbliver bag basic auth.
  matcher: ["/((?!_next/|api/health|api/cron/|api/hermes/status|api/hermes/crm-dossier$|api/agent/log$|seo-tjek$|seo-tjek/rapport/|api/seo-tjek/submit|api/seo-tjek/unsubscribe|login$|api/auth/magic$|api/auth/verify$|studio/demo-site/|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|woff2?)$).*)"],
};


// Constant-time UTF-8 string compare. Edge-safe (no Node crypto.timingSafeEqual).
function ctEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

// Parse "Basic <b64>" header — only split on FIRST colon (passwords may contain `:`).
function parseBasic(header: string): { user: string; pass: string } | null {
  const space = header.indexOf(" ");
  if (space < 0) return null;
  const scheme = header.slice(0, space);
  const encoded = header.slice(space + 1).trim();
  if (scheme !== "Basic" || !encoded) return null;
  let decoded: string;
  try {
    const bin = atob(encoded);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    decoded = new TextDecoder("utf-8").decode(bytes);
  } catch {
    return null;
  }
  const idx = decoded.indexOf(":");
  if (idx < 0) return null;
  return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
}

// HMAC + session-helpers kommer fra src/lib/cc-auth.ts (delt med API-ruterne).

function logAuthFailure(ip: string, reason: string): void {
  // NEVER include credential bytes. Reason is a short tag.
  console.warn(JSON.stringify({ evt: "auth.fail", ip, reason, ts: new Date().toISOString() }));
}

function unauthorized(): Response {
  return new NextResponse("Adgang kræver kodeord.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Command Center", charset="UTF-8"' },
  });
}

function tooManyRequests(): Response {
  return new NextResponse("For mange forsøg. Prøv igen senere.", {
    status: 429,
    headers: { "Retry-After": String(RL_BLOCK_S) },
  });
}

export async function proxy(req: NextRequest): Promise<Response> {
  const USER = process.env.VERCEL_BASIC_AUTH_USER;
  const PASS = process.env.VERCEL_BASIC_AUTH_PASS;
  const SECRET = process.env.AUTH_SESSION_SECRET;
  const previewQueueSecret = process.env.PREVIEW_QUEUE_SECRET;

  // Council-fix (2026-08-19): x-command-center-auth må KUN sættes af proxyen selv
  // efter godkendt basic-auth. Strip enhver udefrakommende kopi på alle stier.
  const sanitized = new Headers(req.headers);
  sanitized.delete("x-command-center-auth");
  sanitized.delete(CC_USER_HEADER);

  // The public Kinly questionnaire creates queue records server-to-server. Keep
  // this narrow: only POST /api/previews with the queue secret bypasses the
  // browser Basic Auth; the route still verifies the same bearer token.
  const isPreviewServiceRequest = req.method === "POST"
    && req.nextUrl.pathname === "/api/previews"
    && Boolean(previewQueueSecret)
    && ctEqual(req.headers.get("authorization") || "", `Bearer ${previewQueueSecret}`);
  if (isPreviewServiceRequest) return NextResponse.next({ request: { headers: sanitized } });

  if (USER && PASS && SECRET) {
    let authed = false;
    // Sessionens bruger som den står i cookien: "m:lucas"/"m:charlie" (magic link)
    // eller "delt" (fælles Basic-login). Headeren får kun personen, se personFromSessionUser.
    let sessionUser = "delt";

    // 1. Fast path: valid session cookie.
    const sessTok = req.cookies.get(SESSION_COOKIE)?.value;
    const cookieUser = sessTok ? await verifySession(sessTok, SECRET) : null;
    if (cookieUser) {
      authed = true;
      sessionUser = personFromSessionUser(cookieUser) ? cookieUser : "delt";
    } else {
      // 2. Verify Basic auth.
      const header = req.headers.get("authorization") || "";
      const parsed = parseBasic(header);
      if (parsed && ctEqual(parsed.user, USER) && ctEqual(parsed.pass, PASS)) {
        authed = true;
      } else if (parsed) {
        // A credential WAS supplied but it's WRONG → this is the only case that
        // counts toward the brute-force rate limit. (A missing/empty header is just
        // a browser that hasn't been prompted yet — mobile fires many parallel,
        // cookie-less requests on first load; counting those wrongly tripped the
        // 1h block and made mobile login impossible.)
        const ip = clientIp(req);
        const rl = await rateLimitCheck(ip);
        if (!rl.allowed) {
          logAuthFailure(ip, rl.blocked ? "rate_block" : "rate_window");
          return tooManyRequests();
        }
        logAuthFailure(ip, "bad_credential");
      } else {
        // No/malformed header → just prompt the dialog, never rate-limited.
        logAuthFailure(clientIp(req), "no_or_malformed_header");
      }
    }

    if (!authed) {
      // Magic-link-login slået til (CC_MAGIC=1): send browser-navigation til
      // /login i stedet for Basic-dialogen. API-kald får stadig 401.
      const wantsPage = req.method === "GET" && !req.nextUrl.pathname.startsWith("/api/");
      // Nødudgang: "?kode=1" giver den fælles Basic-dialog, så en fejlende
      // login-mail (SMTP nede) aldrig låser os ude.
      if (process.env.CC_MAGIC === "1" && wantsPage && req.nextUrl.searchParams.get("kode") !== "1") {
        return NextResponse.redirect(new URL("/login", req.url));
      }
      return unauthorized();
    }

    // Pass a marker to internal API routes as well. This keeps the browser's
    // Basic Auth session and route-level auth in the same chain.
    const requestHeaders = new Headers(sanitized);
    requestHeaders.set(CC_AUTH_HEADER, await ccAuthMarker(SECRET));
    requestHeaders.set(CC_USER_HEADER, personFromSessionUser(sessionUser) ?? "delt");

    // Mint/refresh session cookie on success.
    const fresh = await issueSession(sessionUser, SECRET);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.cookies.set(SESSION_COOKIE, fresh, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_TTL_S,
      path: "/",
    });
    return res;
  }

  if (process.env.VERCEL_ENV === "production" || process.env.VERCEL_ENV === "preview") {
    console.error(JSON.stringify({ evt: "auth.not_configured", env: process.env.VERCEL_ENV }));
    return new NextResponse("Adgang er ikke konfigureret på dette deploy.", { status: 503 });
  }

  // /welcome-first-run-redirectet blev fjernet i Bundle G (2026-07-03) sammen
  // med selve /welcome-siden — internt værktøj, ingen onboarding-flows.
  return NextResponse.next({ request: { headers: sanitized } });
}

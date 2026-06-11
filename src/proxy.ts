import { NextResponse, type NextRequest } from "next/server";

// Proxy (Next 16's renamed middleware) — shared-password access for Lucas +
// Charlie (one code, same access), plus a gentle first-run redirect to /welcome.
//
// Hardened in Block 6 (Security council):
//  - Constant-time comparison (Edge-safe, no Node `timingSafeEqual`).
//  - Correct Basic parsing — splits on FIRST colon, decodes as UTF-8.
//  - HMAC-signed session cookie (12h sliding) so the browser stops sending
//    the password on every request after the first success.
//  - Per-IP rate limit via Vercel KV REST API (5 attempts / 60s → 1h block).
//  - Structured logging of failed attempts (no credential bytes).
//
// Auth is OPT-IN: if VERCEL_BASIC_AUTH_USER/PASS/AUTH_SESSION_SECRET are not all
// set, everything passes through (local dev, preview, this build).

export const config = {
  // Run on everything except Next internals, the health check, and static files.
  // api/hermes/status er også undtaget: ren health-info (ingen hemmeligheder),
  // og den SKAL kunne tjekkes udefra når VPS-forbindelsen fejlsøges.
  matcher: ["/((?!_next/|api/health|api/cron/|api/hermes/status|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|woff2?)$).*)"],
};

const SESSION_COOKIE = "cc_sess";
const SESSION_TTL_S = 60 * 60 * 12; // 12h sliding session
const RL_WINDOW_S = 60;
const RL_MAX = 5;
const RL_BLOCK_S = 60 * 60;

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

// HMAC-SHA256 hex via Web Crypto (Edge-compatible).
async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

async function issueSession(user: string, secret: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_S;
  const payload = `${user}.${exp}`;
  const sig = await hmacHex(secret, payload);
  return `${payload}.${sig}`;
}

async function verifySession(token: string, secret: string): Promise<boolean> {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [user, expStr, sig] = parts;
  const exp = parseInt(expStr, 10);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = await hmacHex(secret, `${user}.${expStr}`);
  return ctEqual(sig, expected);
}

// Rate-limit via Vercel KV REST API. Fail-open if KV is not configured
// (so local dev never gets locked out).
async function rateLimitCheck(ip: string): Promise<{ allowed: boolean; remaining: number; blocked: boolean }> {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { allowed: true, remaining: RL_MAX, blocked: false };

  const key = `auth:rl:${ip}`;
  const blockKey = `auth:block:${ip}`;
  const auth = { Authorization: `Bearer ${tok}` };

  try {
    // Check long block first.
    const blockedRes = await fetch(`${url}/get/${blockKey}`, { headers: auth, signal: AbortSignal.timeout(2500) });
    const blockedJson = blockedRes.ok ? (await blockedRes.json() as { result?: unknown }) : { result: null };
    if (blockedJson.result) return { allowed: false, remaining: 0, blocked: true };

    // Atomic INCR + EXPIRE.
    const pipeRes = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(RL_WINDOW_S), "NX"],
      ]),
      signal: AbortSignal.timeout(2500),
    });
    const pipeJson = pipeRes.ok ? (await pipeRes.json() as Array<{ result?: number }>) : null;
    const count = pipeJson?.[0]?.result ?? 0;
    if (count > RL_MAX) {
      await fetch(`${url}/setex/${blockKey}/${RL_BLOCK_S}/1`, { headers: auth, signal: AbortSignal.timeout(2500) }).catch(() => {});
      return { allowed: false, remaining: 0, blocked: true };
    }
    return { allowed: true, remaining: Math.max(0, RL_MAX - count), blocked: false };
  } catch {
    // KV unreachable → fail open. The auth check itself still gates access.
    return { allowed: true, remaining: RL_MAX, blocked: false };
  }
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

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

  // Auth only enforced when all three are configured.
  if (USER && PASS && SECRET) {
    let authed = false;

    // 1. Fast path: valid session cookie.
    const sessTok = req.cookies.get(SESSION_COOKIE)?.value;
    if (sessTok && (await verifySession(sessTok, SECRET))) {
      authed = true;
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

    if (!authed) return unauthorized();

    // Mint/refresh session cookie on success.
    const fresh = await issueSession(USER, SECRET);
    const res = passThroughWelcome(req, NextResponse.next());
    res.cookies.set(SESSION_COOKIE, fresh, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: SESSION_TTL_S,
      path: "/",
    });
    return res;
  }

  return passThroughWelcome(req, NextResponse.next());
}

function passThroughWelcome(req: NextRequest, res: NextResponse): NextResponse {
  const url = req.nextUrl;
  if (url.pathname === "/" && !req.cookies.get("cc_welcomed")) {
    const dest = url.clone();
    dest.pathname = "/welcome";
    return NextResponse.redirect(dest) as unknown as NextResponse;
  }
  return res;
}

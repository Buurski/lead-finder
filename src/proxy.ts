import { NextResponse, type NextRequest } from "next/server";

// Proxy (Next 16's renamed middleware) — shared-password access for Lucas +
// Charlie (one code, same access), plus a gentle first-run redirect to /welcome.
//
// Auth is OPT-IN: if VERCEL_BASIC_AUTH_USER/PASS aren't set, everything passes
// through (local dev, preview, this build). When set, every route except
// /api/health requires HTTP Basic auth. No roles, no login page — Vercel's own
// password gate is the model.

export const config = {
  // Run on everything except Next internals, the health check, and static files.
  matcher: ["/((?!_next/|api/health|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|css|js|woff2?)$).*)"],
};

function unauthorized(): Response {
  return new NextResponse("Adgang kræver kodeord.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Command Center", charset="UTF-8"' },
  });
}

export function proxy(req: NextRequest): Response {
  const USER = process.env.VERCEL_BASIC_AUTH_USER;
  const PASS = process.env.VERCEL_BASIC_AUTH_PASS;

  // Basic auth (only enforced when configured).
  if (USER && PASS) {
    const header = req.headers.get("authorization") || "";
    const [scheme, encoded] = header.split(" ");
    let ok = false;
    if (scheme === "Basic" && encoded) {
      try {
        const [u, p] = atob(encoded).split(":");
        ok = u === USER && p === PASS;
      } catch {
        ok = false;
      }
    }
    if (!ok) return unauthorized();
  }

  // First-run: send a freshly-arrived user to /welcome once.
  const url = req.nextUrl;
  if (url.pathname === "/" && !req.cookies.get("cc_welcomed")) {
    const dest = url.clone();
    dest.pathname = "/welcome";
    return NextResponse.redirect(dest);
  }

  return NextResponse.next();
}

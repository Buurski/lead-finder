// Delt HTTP-glue for de personlige login-ruter (/api/auth/password og
// /api/auth/setup). Cookie-flagene skal være identiske med /api/auth/verify,
// så de står kun ét sted.
import { NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_TTL_S, issueSession } from "../cc-auth.ts";
import { sessionUserFor, type Person } from "./magic-session.ts";

export function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

/** Login lykkedes → samme signerede session-cookie som magic-link-ruten sætter. */
export async function sessionResponse(userId: string): Promise<NextResponse> {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) {
    console.error(JSON.stringify({ evt: "auth.login.no_secret" }));
    return jsonError(500, "Login er ikke konfigureret");
  }
  const res = NextResponse.json({ ok: true });
  // app_user.id er "lucas"/"charlie" (migration 0007) → "m:<person>" i cookien.
  res.cookies.set(SESSION_COOKIE, await issueSession(sessionUserFor(userId as Person), secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_S,
    path: "/",
  });
  return res;
}

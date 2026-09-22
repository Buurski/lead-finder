import { NextResponse } from "next/server";
import { magicEnabled, redeemLoginToken } from "@/lib/auth/magic";
import { sessionUserFor } from "@/lib/auth/magic-session";
import { issueSession, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/cc-auth";

export const runtime = "nodejs";

// POST (knappen på /login?t=…) → indløs token, sæt session, videre til HQ.
// Bevidst ikke GET: Gmail m.fl. forhåndsindlæser links og ville brænde engangs-tokenet.
export async function POST(req: Request) {
  const secret = process.env.AUTH_SESSION_SECRET;
  const form = await req.formData().catch(() => null);
  const token = String(form?.get("t") ?? "");
  const user = secret && magicEnabled() ? await redeemLoginToken(token) : null;
  if (!secret || !user) return NextResponse.redirect(new URL("/login?fejl=1", req.url), 303);

  const res = NextResponse.redirect(new URL("/", req.url), 303);
  res.cookies.set(SESSION_COOKIE, await issueSession(sessionUserFor(user), secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_S,
    path: "/",
  });
  return res;
}

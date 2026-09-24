// Første login: mail + engangs-opsætningskode + ny adgangskode.
import { NextResponse } from "next/server";
import { clientIp, rateLimitCheck } from "@/lib/auth/rate-limit";
import { jsonError, sessionResponse } from "@/lib/auth/http";
import { setupAccount } from "@/lib/auth/login";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";

// POST {email, code, password} → sæt adgangskoden og session med det samme.
// Kode-fejl (ugyldig/udløbet/brugt) skelnes IKKE i svaret.
export async function POST(req: Request): Promise<NextResponse> {
  if (req.headers.get("sec-fetch-site") === "cross-site") return jsonError(403, "Koden er forkert eller udløbet");

  const rl = await rateLimitCheck(clientIp(req), "setup");
  if (!rl.allowed) return jsonError(429, "For mange forsøg. Prøv igen om lidt.");

  const body = (await req.json().catch(() => null)) as { email?: unknown; code?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.slice(0, 200) : "";
  const code = typeof body?.code === "string" ? body.code.slice(0, 100) : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const res = await setupAccount(getDb(), { email, code, password });
  if (res.ok) return sessionResponse(res.user.id);
  if (res.reason === "svag") return jsonError(400, `Adgangskoden skal være mindst ${MIN_PASSWORD_LENGTH} tegn`);
  return jsonError(400, "Koden er forkert eller udløbet");
}

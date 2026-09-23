// Personligt login med mail + adgangskode. Ingen mail-sending — koden sættes
// offline af scripts/hq-bootstrap.ts.
import { NextResponse } from "next/server";
import { clientIp, rateLimitCheck } from "@/lib/auth/rate-limit";
import { jsonError, sessionResponse } from "@/lib/auth/http";
import { loginWithPassword } from "@/lib/auth/login";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";

// POST {email, password} → sæt session. Fejl er generisk, så svaret ikke
// afslører om mailen findes.
export async function POST(req: Request): Promise<NextResponse> {
  if (req.headers.get("sec-fetch-site") === "cross-site") return jsonError(403, "Forkert e-mail eller kode");

  const rl = await rateLimitCheck(clientIp(req), "password");
  if (!rl.allowed) return jsonError(429, "For mange forsøg. Prøv igen om lidt.");

  const body = (await req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  const email = typeof body?.email === "string" ? body.email.slice(0, 200) : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const login = await loginWithPassword(getDb(), { email, password });
  if (!login.ok) return jsonError(401, "Forkert e-mail eller kode");
  return sessionResponse(login.user.id);
}

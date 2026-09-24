// Skift af egen adgangskode. Kræver personligt login — "delt" (den fælles
// kode) afvises, da den ikke identificerer en person.
import { NextResponse } from "next/server";
import { clientIp, rateLimitCheck } from "@/lib/auth/rate-limit";
import { jsonError } from "@/lib/auth/http";
import { changePassword } from "@/lib/auth/login";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/password";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<NextResponse> {
  if (req.headers.get("sec-fetch-site") === "cross-site") return jsonError(403, "Afvist");

  const rl = await rateLimitCheck(clientIp(req), "password");
  if (!rl.allowed) return jsonError(429, "For mange forsøg. Prøv igen om lidt.");

  const user = await currentUser();
  if (user !== "lucas" && user !== "charlie") {
    return jsonError(401, "Log ind med din egen mail, før du skifter kode");
  }

  const body = (await req.json().catch(() => null)) as
    | { currentPassword?: unknown; nextPassword?: unknown }
    | null;
  const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const nextPassword = typeof body?.nextPassword === "string" ? body.nextPassword : "";

  const res = await changePassword(getDb(), user, { currentPassword, nextPassword });
  if (res.ok) return NextResponse.json({ ok: true });
  if (res.reason === "svag") return jsonError(400, `Adgangskoden skal være mindst ${MIN_PASSWORD_LENGTH} tegn`);
  return jsonError(401, "Nuværende adgangskode er forkert");
}

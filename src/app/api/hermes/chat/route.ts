import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import {
  appendHermesExchange,
  canAccessSession,
  hermesChat,
  listAllSessions,
  type HermesProfile,
} from "@/lib/hermes";

// POST /api/hermes/chat — send one message to the Hermes agent on the VPS.
// Body: { message, sessionId }. Ejer udledes af currentUser(); et `profile` i
// body ignoreres helt (klienten må ikke kunne vælge en andens profil).
// Reply is synchronous (the shim runs `hermes -z … --continue web-<sessionId>`),
// so this route may take a while.
export const dynamic = "force-dynamic";
export const maxDuration = 200;

const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: Request) {
  let body: { message?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "ugyldig JSON" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  const sessionId = (body.sessionId ?? "").trim();

  if (!message) return NextResponse.json({ ok: false, error: "besked mangler" }, { status: 400 });
  if (message.length > 8000) return NextResponse.json({ ok: false, error: "besked over 8000 tegn" }, { status: 400 });
  if (!SESSION_RE.test(sessionId)) return NextResponse.json({ ok: false, error: "ugyldigt sessionId" }, { status: 400 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "ikke logget ind" }, { status: 401 });
  const profile: HermesProfile = user === "lucas" || user === "charlie" ? user : "default";
  // Ejerskabs-gate: ukendt id = ny samtale (tilladt), fremmed id = afvist.
  const existing = (await listAllSessions()).find((s) => s.id === sessionId);
  if (existing && !canAccessSession(existing, user)) {
    return NextResponse.json({ ok: false, error: "samtalen tilhører en anden bruger" }, { status: 403 });
  }

  const result = await hermesChat(message, profile, sessionId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  await appendHermesExchange(sessionId, user, message, result.reply ?? "");
  return NextResponse.json({ ok: true, reply: result.reply, elapsedMs: result.elapsedMs });
}

import { NextResponse } from "next/server";
import { appendHermesExchange, hermesChat, HERMES_PROFILES, type HermesProfile } from "@/lib/hermes";

// POST /api/hermes/chat — send one message to the Hermes agent on the VPS.
// Body: { message, profile, sessionId }. Reply is synchronous (the shim runs
// `hermes -z … --continue web-<sessionId>`), so this route may take a while.
export const dynamic = "force-dynamic";
export const maxDuration = 200;

const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function POST(req: Request) {
  let body: { message?: string; profile?: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "ugyldig JSON" }, { status: 400 });
  }
  const message = (body.message ?? "").trim();
  const profile = (body.profile ?? "default") as HermesProfile;
  const sessionId = (body.sessionId ?? "").trim();

  if (!message) return NextResponse.json({ ok: false, error: "besked mangler" }, { status: 400 });
  if (message.length > 8000) return NextResponse.json({ ok: false, error: "besked over 8000 tegn" }, { status: 400 });
  if (!HERMES_PROFILES.includes(profile)) return NextResponse.json({ ok: false, error: "ukendt profil" }, { status: 400 });
  if (!SESSION_RE.test(sessionId)) return NextResponse.json({ ok: false, error: "ugyldigt sessionId" }, { status: 400 });

  const result = await hermesChat(message, profile, sessionId);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }
  await appendHermesExchange(sessionId, profile, message, result.reply ?? "");
  return NextResponse.json({ ok: true, reply: result.reply, elapsedMs: result.elapsedMs });
}

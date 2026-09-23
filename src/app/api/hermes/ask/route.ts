import { NextResponse } from "next/server";
import { assertWriteRequest } from "@/lib/cc-auth";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db/client";
import {
  appendHermesExchange,
  canAccessSession,
  hermesChat,
  listAllSessions,
  type HermesProfile,
} from "@/lib/hermes";
import { dossierText, getDossier } from "@/lib/hq/dossier";
import { loadCustomerNotes } from "@/lib/hq/notes";
import { copenhagenNow } from "@/lib/settings";

export const runtime = "nodejs";
export const maxDuration = 200;

const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f-]{36}$/i;

// Hermes-docken: spørgsmål + kontekst-pakke fra CRM'et. På en kundeside sendes
// kunde-mappen med, så Hermes svarer ud fra facit uden selv at slå op.
export async function POST(req: Request) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 403 });
  }
  const b = (await req.json().catch(() => null)) as { message?: unknown; sessionId?: unknown; companyId?: unknown; page?: unknown } | null;
  const message = typeof b?.message === "string" ? b.message.trim() : "";
  const sessionId = typeof b?.sessionId === "string" ? b.sessionId : "";
  if (!message || message.length > 4000) return NextResponse.json({ ok: false, error: "spørgsmål mangler eller er for langt" }, { status: 400 });
  if (!SESSION_RE.test(sessionId)) return NextResponse.json({ ok: false, error: "ugyldig session" }, { status: 400 });

  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "ikke logget ind" }, { status: 401 });
  const profile: HermesProfile = user === "lucas" || user === "charlie" ? user : "default";
  // Ejerskabs-gate: ukendt id = ny samtale (tilladt), fremmed id = afvist.
  const existing = (await listAllSessions()).find((s) => s.id === sessionId);
  if (existing && !canAccessSession(existing, user)) {
    return NextResponse.json({ ok: false, error: "samtalen tilhører en anden bruger" }, { status: 403 });
  }

  let context = "";
  if (typeof b?.companyId === "string" && UUID.test(b.companyId)) {
    const d = await getDossier(getDb(), b.companyId, { today: copenhagenNow().date, loadNotes: loadCustomerNotes });
    context = d ? dossierText(d) : "";
  } else if (typeof b?.page === "string" && b.page.length < 200) {
    context = `Brugeren står på siden ${b.page} i Kinly HQ (CRM).`;
  }

  const prompt = context
    ? `${message}\n\n---\nKONTEKST FRA KINLY HQ (CRM'et er facit for tal, priser og status; vault-noterne for viden):\n${context}`
    : message;
  const started = Date.now();
  const result = await hermesChat(prompt, profile, sessionId);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  // Historikken gemmer spørgsmålet uden den lange kontekst.
  await appendHermesExchange(sessionId, user, message, result.reply ?? "");
  return NextResponse.json({ ok: true, reply: result.reply, elapsedMs: result.elapsedMs ?? Date.now() - started, withContext: Boolean(context) });
}

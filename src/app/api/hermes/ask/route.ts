import { NextResponse } from "next/server";
import { assertWriteRequest } from "@/lib/cc-auth";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db/client";
import {
  appendHermesExchange,
  canAccessSession,
  hermesChatPoll,
  hermesChatStart,
  hermesChatStreamRaw,
  listAllSessions,
  type HermesProfile,
} from "@/lib/hermes";
import { dossierText, getDossier } from "@/lib/hq/dossier";
import { loadCustomerNotes } from "@/lib/hq/notes";
import { copenhagenNow } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 200;

const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f-]{36}$/i;
const REQUEST_RE = /^[0-9a-f]{32}$/;

// Hermes-docken: spørgsmål + kontekst-pakke fra CRM'et. På en kundeside sendes
// kunde-mappen med, så Hermes svarer ud fra facit uden selv at slå op.
//
// Rigtige spørgsmål kører i minutter på VPS'en (agenten laver værktøjsløb), og
// det overlever én HTTP-request bag en Vercel-funktion ikke. Derfor: POST starter
// turen og svarer straks med et request_id; klienten poller GET, indtil svaret
// ligger klar i hermes-api.
export async function POST(req: Request) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 403 });
  }
  const b = (await req.json().catch(() => null)) as { message?: unknown; sessionId?: unknown; companyId?: unknown; page?: unknown; stream?: unknown } | null;
  const message = typeof b?.message === "string" ? b.message.trim() : "";
  const sessionId = typeof b?.sessionId === "string" ? b.sessionId : "";
  const wantStream = b?.stream === true;
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

  // Streaming-vej (2026-09-24): svar vises mens agenten arbejder. VPS'ens SSE
  // videresendes rå; undervejs samler vi det færdige svar, så historikken også
  // gemmes for streamede svar (flush ved normal afslutning). Kan streamen ikke
  // startes, falder vi igennem til start/poll nedenfor — uændret.
  if (wantStream) {
    const upstream = await hermesChatStreamRaw(prompt, profile, sessionId);
    if (upstream?.body) {
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let full = "";
      let sawDone = false;
      const ts = new TransformStream<Uint8Array, Uint8Array>({
        transform(chunk, controller) {
          controller.enqueue(chunk);
          buf += decoder.decode(chunk, { stream: true });
          let i: number;
          while ((i = buf.indexOf("\n\n")) >= 0) {
            const part = buf.slice(0, i);
            buf = buf.slice(i + 2);
            const line = part.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim()) as { text?: string; done?: boolean; full_text?: string; error?: string };
              if (typeof ev.text === "string") acc += ev.text;
              if (ev.done === true && !ev.error) {
                full = typeof ev.full_text === "string" && ev.full_text ? ev.full_text : acc;
                if (full) sawDone = true;
              }
            } catch {
              // ignorér ugyldig JSON i én event
            }
          }
        },
        async flush() {
          if (sawDone && full) {
            try {
              await appendHermesExchange(sessionId, user, message, full);
            } catch {
              // KV-hikke må ikke koste svaret — det er allerede leveret til klienten.
            }
          }
        },
      });
      return new Response(upstream.body.pipeThrough(ts), {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          "X-Accel-Buffering": "no",
        },
      });
    }
  }

  const start = await hermesChatStart(prompt, profile, sessionId);
  if (!start.ok || !start.requestId) {
    return NextResponse.json({ ok: false, error: start.error ?? "Hermes-fejl" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, requestId: start.requestId, pending: true, withContext: Boolean(context) });
}

// Polling-endepunkt: henter svaret når turen er færdig på VPS'en. Første poll
// der ser et færdigt svar gemmer samtaleparret i historikken (consume-værn i
// hermes-api sikrer, at det kun sker én gang).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId") ?? "";
  const requestId = url.searchParams.get("requestId") ?? "";
  if (!SESSION_RE.test(sessionId) || !REQUEST_RE.test(requestId)) {
    return NextResponse.json({ ok: false, error: "ugyldige parametre" }, { status: 400 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "ikke logget ind" }, { status: 401 });
  const existing = (await listAllSessions()).find((s) => s.id === sessionId);
  if (existing && !canAccessSession(existing, user)) {
    return NextResponse.json({ ok: false, error: "samtalen tilhører en anden bruger" }, { status: 403 });
  }

  const poll = await hermesChatPoll(requestId, true);
  if (!poll.ok) return NextResponse.json({ ok: false, error: poll.error ?? "Hermes-fejl" }, { status: 502 });
  if (poll.status === "running") return NextResponse.json({ ok: true, status: "running" });
  if (poll.status === "done") {
    // Historikken gemmer spørgsmålet uden den lange kontekst (klienten sender
    // originalen med på pollingen); den valideres blot som tekst.
    const q = (url.searchParams.get("message") ?? "").slice(0, 4000);
    if (poll.fresh && q) {
      try {
        await appendHermesExchange(sessionId, user, q, poll.reply ?? "");
      } catch {
        // KV-hikke må ikke koste svaret — det leveres alligevel til klienten.
      }
    }
    return NextResponse.json({ ok: true, status: "done", reply: poll.reply ?? "", elapsedMs: poll.elapsedMs });
  }
  return NextResponse.json({ ok: false, error: poll.error ?? "Hermes-fejl" }, { status: 502 });
}

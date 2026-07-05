import { NextResponse } from "next/server";
import {
  appendHermesExchange,
  hermesChat,
  hermesChatStreamRaw,
  HERMES_PROFILES,
  type HermesProfile,
} from "@/lib/hermes";

// POST /api/hermes/chat/stream — streaming chat (SSE) mod Hermes på VPS'en.
// Proxy'er shimmens /api/chat/stream til browseren og gemmer hele svaret i
// KV når streamen er færdig. Falder tilbage til blocking chat (som så sendes
// som ét samlet SSE-event) hvis shimmen ikke kan streame.
export const dynamic = "force-dynamic";
export const maxDuration = 200;

const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;
const enc = new TextEncoder();

function sse(obj: unknown): Uint8Array {
  return enc.encode(`data: ${JSON.stringify(obj)}\n\n`);
}

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

  const upstream = await hermesChatStreamRaw(message, profile, sessionId);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let fullText = "";

      if (!upstream?.body) {
        // Fallback: blocking chat, leveret som én SSE-tur.
        controller.enqueue(sse({ status: "thinking", method: "fallback" }));
        const result = await hermesChat(message, profile, sessionId);
        if (result.ok && result.reply) {
          controller.enqueue(sse({ text: result.reply }));
          controller.enqueue(sse({ done: true, method: "fallback", elapsed_ms: result.elapsedMs }));
          await appendHermesExchange(sessionId, profile, message, result.reply).catch(() => {});
        } else {
          controller.enqueue(sse({ error: result.error ?? "Hermes svarede ikke", done: true }));
        }
        controller.close();
        return;
      }

      // Passthrough + akkumulering: vi parser upstream-SSE'en for at kende
      // den samlede tekst (til KV), men sender bytes videre uændret.
      const reader = upstream.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          buf += dec.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf("\n\n")) >= 0) {
            const event = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 2);
            if (!event.startsWith("data: ")) continue;
            try {
              const obj = JSON.parse(event.slice(6));
              if (typeof obj.text === "string") fullText += obj.text;
              if (obj.done && typeof obj.full_text === "string" && obj.full_text) {
                fullText = obj.full_text;
              }
            } catch {
              /* ignorér halve/ugyldige events */
            }
          }
        }
      } catch {
        controller.enqueue(sse({ error: "forbindelsen til Hermes røg undervejs", done: true }));
      }

      if (fullText) {
        await appendHermesExchange(sessionId, profile, message, fullText).catch(() => {});
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

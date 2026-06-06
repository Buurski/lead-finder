import { NextResponse } from "next/server";
import { generate, isAiEnabled } from "@/lib/ai";
import { getLeads } from "@/lib/sheets";

// POST /api/chat — the in-app Claude assistant (ChatDock + /claude).
//
// Two outcomes:
//   1. ADVISORY — normal question → a model answer (Sonnet via ai.ts; logs spend).
//   2. ACTION PROPOSAL — when the message is an instruction the app can perform
//      ("Allan er ikke interesseret", "drop Salon Artec", "noter: ..."), we detect
//      it deterministically (no model tokens), resolve the lead, and return a
//      structured proposal { action } that ChatDock shows behind a Bekræft button.
//      The actual mutation happens in /api/actions/* only after confirmation.
//
// Read-only by itself: detecting/advising never changes anything.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Status = "interested" | "not-interested" | "maybe-later";

// Deterministic Danish intent detection. Returns the status verb + whether it's a
// note, or null when it's just a question.
function detectIntent(text: string): { kind: "status"; status: Status } | { kind: "note"; bucket: string; note: string } | null {
  const t = text.toLowerCase();
  const noteM = text.match(/^\s*(noter|note|husk|skriv ned)\b[:\-\s]+(.+)/i);
  if (noteM) {
    const note = noteM[2].trim();
    const bucket = /sagde nej|ikke interesseret/i.test(note) ? "said-no" : /senere|fremtid/i.test(note) ? "maybe-later" : "general";
    return { kind: "note", bucket, note };
  }
  if (/\b(ikke interesseret|ikke interesserede|sagde nej|nej tak|drop(?:per)?|frasort\w+|afvis)\b/.test(t)) return { kind: "status", status: "not-interested" };
  if (/\b(måske senere|maaske senere|om en måned|følg op senere|senere hen|ikke nu men)\b/.test(t)) return { kind: "status", status: "maybe-later" };
  if (/\b(er interesseret|interesseret nu|sagde ja|vil gerne|positiv|varm lead)\b/.test(t)) return { kind: "status", status: "interested" };
  return null;
}

const STATUS_LABEL: Record<Status, string> = {
  interested: "interesseret", "not-interested": "ikke interesseret", "maybe-later": "måske senere",
};

export async function POST(req: Request) {
  let body: { message?: string; screen?: string; queue?: number; needs?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty */
  }
  const message = String(body.message ?? "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ error: "Tom besked." }, { status: 400 });

  const intent = detectIntent(message);

  // NOTE action — no lead lookup needed.
  if (intent && intent.kind === "note") {
    return NextResponse.json({
      action: { type: "note", args: { text: intent.note, bucket: intent.bucket }, label: `Gem note (${intent.bucket}): "${intent.note.slice(0, 80)}"` },
      humanText: "Vil du gemme den note? (spejles til Obsidian af din Cowork-task)",
    });
  }

  // STATUS action — resolve which known lead is mentioned.
  if (intent && intent.kind === "status") {
    let match: { id: string; name: string } | null = null;
    try {
      const leads = await getLeads();
      const lower = message.toLowerCase();
      // longest lead-name that appears in the message wins (avoids matching "A").
      for (const l of leads) {
        const n = (l.name || "").trim();
        if (n.length >= 3 && lower.includes(n.toLowerCase())) {
          if (!match || n.length > match.name.length) match = { id: l.id, name: n };
        }
      }
    } catch {
      /* sheets unreachable → fall through to advisory */
    }
    if (match) {
      return NextResponse.json({
        action: {
          type: "mark-lead",
          args: { leadId: match.id, leadName: match.name, status: intent.status },
          label: `Marker "${match.name}" som ${STATUS_LABEL[intent.status]}`,
        },
        humanText: `Skal jeg markere ${match.name} som ${STATUS_LABEL[intent.status]}?${intent.status === "not-interested" ? " (kontakter ikke igen)" : intent.status === "maybe-later" ? " (følger op om ~30 dage)" : ""}`,
      });
    }
    // verb but no known lead → let the model answer/ask which lead.
  }

  // ADVISORY — the original behaviour.
  if (!isAiEnabled()) {
    return NextResponse.json({ reply: "AI-nøgle er ikke sat i dette miljø, så jeg svarer ikke live her endnu." });
  }
  const screen = String(body.screen ?? "").slice(0, 40);
  const queue = Number.isFinite(body.queue) ? body.queue : undefined;
  const needs = Number.isFinite(body.needs) ? body.needs : undefined;
  const state = [
    queue != null ? `${queue} udkast i godkendelses-køen` : null,
    needs != null ? `${needs} ting kræver dig` : null,
    screen ? `skærm: ${screen}` : null,
  ].filter(Boolean).join(" · ");

  const res = await generate({
    task: "research",
    system:
      "Du er Claude i Lucas's Command Center — en rolig, skarp assistent for hans lead-CRM og agentic OS. " +
      "Svar kort og konkret på dansk. Du rådgiver og forklarer. Hvis brugeren vil markere en lead eller gemme en note, " +
      "så bed dem skrive fx 'marker <virksomhed> som ikke interesseret' eller 'noter: ...'. " +
      "Henvis til de rigtige sider (/leads, /leadgen, /approve, /replies, /messenger, /clients, /spend)." +
      (state ? `\n\nNuværende tilstand: ${state}.` : ""),
    prompt: message,
    maxTokens: 600,
    temperature: 0.5,
  });
  if (!res) return NextResponse.json({ reply: "Jeg kunne ikke nå modellen lige nu — prøv igen om lidt." });
  return NextResponse.json({ reply: res.text.trim(), model: res.model, provider: res.provider });
}

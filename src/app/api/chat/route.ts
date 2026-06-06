import { NextResponse } from "next/server";
import { generate, isAiEnabled } from "@/lib/ai";
import { getLeads, getClients } from "@/lib/sheets";

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
function detectIntent(text: string):
  | { kind: "status"; status: Status }
  | { kind: "note"; bucket: string; note: string }
  | { kind: "suppress" }
  | null {
  const t = text.toLowerCase();
  const noteM = text.match(/^\s*(noter|note|husk|skriv ned)\b[:\-\s]+(.+)/i);
  if (noteM) {
    const note = noteM[2].trim();
    const bucket = /sagde nej|ikke interesseret/i.test(note) ? "said-no" : /senere|fremtid/i.test(note) ? "maybe-later" : "general";
    return { kind: "note", bucket, note };
  }
  if (/\b(ikke interesseret|ikke interesserede|sagde nej|nej tak|frasort\w+|afvis)\b/.test(t)) return { kind: "status", status: "not-interested" };
  if (/\b(måske senere|maaske senere|om en måned|følg op senere|senere hen|ikke nu men)\b/.test(t)) return { kind: "status", status: "maybe-later" };
  if (/\b(er interesseret|interesseret nu|sagde ja|vil gerne|positiv|varm lead)\b/.test(t)) return { kind: "status", status: "interested" };
  // "fjern X fra i dag", "jeg vil ikke have X", "X skal ikke stå der", "drop X"
  if (/\b(fjern|drop(?:per)?|skjul|ikke have|skal ikke stå|skal ikke vises|fjerne)\b/.test(t)) return { kind: "suppress" };
  return null;
}

// Find the lead or client whose name appears in the message (longest wins, ≥3 chars).
function findBusiness(message: string, leads: { id: string; name: string }[], clients: { id: string; name: string }[]):
  { id: string; name: string; kind: "lead" | "client" } | null {
  const lower = message.toLowerCase();
  let best: { id: string; name: string; kind: "lead" | "client" } | null = null;
  const scan = (rows: { id: string; name: string }[], kind: "lead" | "client") => {
    for (const r of rows) {
      const n = (r.name || "").trim();
      if (n.length >= 3 && lower.includes(n.toLowerCase()) && (!best || n.length > best.name.length)) {
        best = { id: r.id, name: n, kind };
      }
    }
  };
  scan(leads, "lead");
  scan(clients, "client");
  return best;
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

  // STATUS / SUPPRESS — resolve which known lead OR client is mentioned.
  if (intent && (intent.kind === "status" || intent.kind === "suppress")) {
    let biz: { id: string; name: string; kind: "lead" | "client" } | null = null;
    try {
      const [leads, clients] = await Promise.all([getLeads(), getClients()]);
      biz = findBusiness(message, leads, clients);
    } catch {
      /* sheets unreachable → fall through to advisory */
    }

    if (biz) {
      // A real LEAD with a status verb → mark it (also suppresses from today server-side).
      if (intent.kind === "status" && biz.kind === "lead") {
        return NextResponse.json({
          action: { type: "mark-lead", args: { leadId: biz.id, leadName: biz.name, status: intent.status }, label: `Marker "${biz.name}" som ${STATUS_LABEL[intent.status]}` },
          humanText: `Skal jeg markere ${biz.name} som ${STATUS_LABEL[intent.status]}?${intent.status === "not-interested" ? " (kontakter ikke igen + fjernes fra i dag)" : intent.status === "maybe-later" ? " (følger op om ~30 dage)" : ""}`,
        });
      }
      // A positive client signal shouldn't hide them — just note it.
      if (intent.kind === "status" && intent.status === "interested") {
        return NextResponse.json({
          action: { type: "note", args: { text: `${biz.name} er interesseret.`, bucket: "interested" }, label: `Noter: ${biz.name} er interesseret` },
          humanText: `Skal jeg notere at ${biz.name} er interesseret?`,
        });
      }
      // A client said no / maybe-later, or an explicit "fjern fra i dag" → hide it.
      const note = intent.kind === "status" && intent.status === "maybe-later" ? `${biz.name} — opfølgning senere.` : intent.kind === "status" && intent.status === "not-interested" ? `${biz.name} sagde nej / ikke nu.` : `Skjult fra i dag: ${biz.name}.`;
      return NextResponse.json({
        action: { type: "suppress", args: { name: biz.name, note }, label: `Fjern "${biz.name}" fra "i dag"` },
        humanText: `Skal jeg fjerne ${biz.name} fra "Hvad skal vi i dag" og notere det? (rører ikke layoutet)`,
      });
    }
    // verb but no known business → let the model ask which one.
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

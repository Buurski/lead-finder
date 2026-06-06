import { NextResponse } from "next/server";
import { generate, isAiEnabled } from "@/lib/ai";

// POST /api/chat — the in-app Claude assistant (ChatDock + /claude).
//
// Talks to the model via the same ai.ts gateway as the pipeline, so it uses the
// ANTHROPIC_API_KEY and — crucially — logs spend through trackSpend(), so every
// chat shows up on /spend (AI Spend). Read-only/advisory for now: it explains
// and advises but performs NO actions (no sends, no deletes, no writes).
//
// The client passes the counts it already has on screen, so we don't do a Sheets
// read per message (latency + quota friendly).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { message?: string; screen?: string; queue?: number; needs?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body */
  }

  const message = String(body.message ?? "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ error: "Tom besked." }, { status: 400 });

  if (!isAiEnabled()) {
    return NextResponse.json({
      reply: "AI-nøgle er ikke sat i dette miljø, så jeg svarer ikke live her endnu. Sæt ANTHROPIC_API_KEY, så kører jeg.",
    });
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
    task: "research", // Sonnet — cheaper than Opus, plenty for chat
    system:
      "Du er Claude i Lucas's Command Center — en rolig, skarp assistent for hans lead-CRM og agentic OS. " +
      "Svar kort og konkret på dansk. Du rådgiver og forklarer, men UDFØRER ingen handlinger endnu " +
      "(ingen mails sendes, intet slettes/skrives). Henvis til de rigtige sider (/leads, /approve, /replies, " +
      "/clients, /spend) når det er relevant." +
      (state ? `\n\nNuværende tilstand: ${state}.` : ""),
    prompt: message,
    maxTokens: 600,
    temperature: 0.5,
  });

  if (!res) {
    return NextResponse.json({ reply: "Jeg kunne ikke nå modellen lige nu — prøv igen om lidt." });
  }
  return NextResponse.json({ reply: res.text.trim(), model: res.model, provider: res.provider });
}

import { NextResponse } from "next/server";
import { readRadar } from "@/lib/radar";

// GET /api/radar — the AI-Radar feed (curated by the daily Cowork radar task,
// read remote-first from the vault). Read-only, never scrapes.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  const feed = await readRadar();
  return NextResponse.json({ ok: true, at: feed?.at ?? null, items: feed?.items ?? [] });
}

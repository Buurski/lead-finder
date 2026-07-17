import { NextResponse } from "next/server";
import { readVaultJson } from "@/lib/vault";

// GET /api/omverden — kurateret omverdens-viden (TechTwitter, AI-nyt, idéer)
// til forsiden. Produceres af den LOKALE scheduled task "omverden-daily" der
// kører last30days-skillet i Claude Code og skriver data/omverden.json til
// vaulten (skills kan IKKE køre i Vercel-crons — hard gate, session 6
// 2026-07-17). Denne rute LÆSER kun. Stale er synligt by design: `at` vises
// på forsiden, og staleHours lader UI'en dæmpe gamle fund i stedet for at
// skjule at tasken ikke har kørt.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface OmverdenItem {
  title: string;
  summary: string;
  url?: string;
  source: string; // "x" | "reddit" | "hn" | "github" | "web" | …
  tag?: string;   // "ai" | "kinly" | "lead-system" | "idé" | …
}

interface OmverdenFile {
  at: string; // ISO — hvornår kørslen skete
  items: OmverdenItem[];
}

export async function GET() {
  const file = await readVaultJson<OmverdenFile>("data/omverden.json");
  if (!file || !Array.isArray(file.items)) {
    return NextResponse.json({ ok: false, reason: "data/omverden.json findes ikke i vaulten endnu" });
  }
  const items = file.items
    .filter((i) => i && typeof i.title === "string" && i.title.trim())
    .slice(0, 5)
    .map((i) => ({
      title: i.title.trim(),
      summary: typeof i.summary === "string" ? i.summary.trim() : "",
      url: typeof i.url === "string" && /^https?:\/\//.test(i.url) ? i.url : undefined,
      source: typeof i.source === "string" ? i.source : "web",
      tag: typeof i.tag === "string" ? i.tag : undefined,
    }));
  const atMs = Date.parse(file.at ?? "");
  const staleHours = Number.isFinite(atMs) ? Math.round((Date.now() - atMs) / 3_600_000) : null;
  return NextResponse.json({ ok: true, at: file.at ?? null, staleHours, items });
}

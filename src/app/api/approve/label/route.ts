// POST /api/approve/label — Lucas dømmer et lead god/dårlig fra /godkendelse.
// GET  /api/approve/label — alle labels + hvor tæt vi er på at kunne måle.
//
// OBSERVERER KUN: en label ændrer ingen kladde-status, sender intet og sletter
// intet. Den er træningsdata til næste kalibrering af attraktivitets-formlen.
// Ruten ligger bag samme basic auth som resten af app'en (src/proxy.ts).

import { NextResponse } from "next/server";
import { readQueue } from "@/lib/queue";
import { loadLabels, saveLabel, deleteLabel, labelStats, isLabelValue } from "@/lib/leads/labels";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const labels = await loadLabels();
  return NextResponse.json({ ok: true, labels, stats: labelStats(labels) }, { headers: { "Cache-Control": "no-store" } });
}

interface Body {
  id?: string;
  label?: unknown;
  jevLead?: unknown;
  jevDraft?: unknown;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function POST(req: Request): Promise<NextResponse> {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return NextResponse.json({ ok: false, error: "id required" }, { status: 400 });

  // Klik igen på den samme knap = fortryd.
  if (body.label === null) {
    await deleteLabel(id);
    const labels = await loadLabels();
    return NextResponse.json({ ok: true, removed: true, stats: labelStats(labels) });
  }
  if (!isLabelValue(body.label)) {
    return NextResponse.json({ ok: false, error: 'label skal være "god", "daarlig" eller null' }, { status: 400 });
  }

  // Navn/branche/by kopieres fra køen, så labelen stadig kan læses når kladden
  // er væk. Findes kladden ikke, er der intet at dømme om.
  const draft = (await readQueue()).find((d) => d.id === id);
  if (!draft) return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });

  await saveLabel({
    draftId: draft.id,
    leadId: draft.leadId,
    name: draft.name,
    branch: draft.branch,
    city: draft.city,
    label: body.label,
    jevLead: num(body.jevLead),
    jevDraft: num(body.jevDraft),
    at: new Date().toISOString(),
  });
  const labels = await loadLabels();
  return NextResponse.json({ ok: true, stats: labelStats(labels) });
}

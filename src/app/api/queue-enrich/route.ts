// POST /api/queue-enrich — fyld forretningsdata på kladderne i godkendelses-køen
// og vurdér dem med Jev.
//
// Hvorfor (Lucas 2026-09-21): kladder fra ingest-kilder har aldrig haft en
// Sheets-række, og QueueDraft havde intet `website`. Derfor kunne forretningen
// bag dem ALDRIG hentes og vurderes — de kunne kun få en kladde-score, aldrig
// en karakter der sagde noget om virksomheden. Det var hullet hvor de dårlige
// barbershop-kladder gemte sig.
//
// To trin pr. kladde:
//   1. Google Places-opslag på navn + by  → website, anmeldelsestal, drift-status
//   2. Jev-vurdering af forretningen      → attraktivitet, samme formel som alle andre
//
// KOSTER PENGE (ét Places-kald pr. kladde), så ruten er eksplicit: den gør
// ingenting uden `?limit=`, og GET viser bare hvor mange der mangler og hvad
// det koster. Permanent lukkede forretninger afvises automatisk — det er den
// eneste status hvor vi med sikkerhed ved at der ikke er en kunde.

import { NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/queue";
import { lookupPlace } from "@/lib/apify";
import { jevEnabled } from "@/lib/jev";
import { judgeLead, saveShadow } from "@/lib/leads/jev-shadow";
import { getClients } from "@/lib/sheets";
import type { Lead } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Google Places Text Search, Enterprise-felter — samme SKU som scraperen bruger. */
const KR_PR_OPSLAG = 0.22;
const MAX_PR_KOERSEL = 250;
const DEADLINE_MS = 250_000;

function mangler(d: { status: string; website?: string; businessStatus?: string }): boolean {
  return d.status === "pending" && !d.website && !d.businessStatus;
}

export async function GET(): Promise<NextResponse> {
  const queue = await readQueue();
  const rest = queue.filter(mangler).length;
  return NextResponse.json({
    ok: true,
    mangler: rest,
    anslaaetPris: `${(rest * KR_PR_OPSLAG).toFixed(2)} kr`,
    note: "POST med ?limit=N for at køre. Intet sker uden limit.",
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  const url = new URL(req.url);
  const raw = parseInt(url.searchParams.get("limit") ?? "", 10);
  if (!Number.isFinite(raw) || raw < 1) {
    return NextResponse.json({ ok: false, error: "limit påkrævet — ruten koster Places-kald" }, { status: 400 });
  }
  const limit = Math.min(MAX_PR_KOERSEL, raw);
  const deadline = Date.now() + DEADLINE_MS;

  const queue = await readQueue();
  const batch = queue.filter(mangler).slice(0, limit);
  if (batch.length === 0) {
    return NextResponse.json({ ok: true, beriget: 0, vurderet: 0, lukkede: 0, mangler: 0, note: "ingen kladder mangler data" });
  }

  const clients = await getClients().catch(() => []);
  const kanVurdere = jevEnabled();

  let beriget = 0;
  let vurderet = 0;
  let lukkede = 0;
  let udenFund = 0;
  const now = new Date().toISOString();

  // Sekventielt: Places har en rate limit, og en kladde koster penge — vi vil
  // hellere nå færre end at brænde kald på en 429-storm.
  for (const draft of batch) {
    if (Date.now() > deadline) break;
    let place = null;
    try {
      place = await lookupPlace(draft.name, draft.city);
    } catch {
      break; // nøgle mangler eller Places er nede — stop, brænd ikke resten
    }
    if (!place) {
      udenFund++;
      continue;
    }
    draft.website = place.website ?? "";
    draft.reviewsCount = place.reviewsCount ?? 0;
    draft.businessStatus = place.businessStatus ?? "";
    draft.updatedAt = now;
    beriget++;

    // Permanent lukket = der er ingen kunde. Eneste automatiske afvisning her.
    // CLOSED_TEMPORARILY røres IKKE — ferielukket er stadig en kunde.
    if (place.businessStatus === "CLOSED_PERMANENTLY") {
      draft.status = "rejected";
      lukkede++;
      continue;
    }

    if (!kanVurdere || !draft.website) continue;
    // Syntetisk Lead, så kladden går gennem PRÆCIS samme vurdering som et
    // lead fra arket — ingen parallel scoringsvej der kan divergere.
    const somLead = {
      id: draft.leadId,
      name: draft.name,
      branch: draft.branch,
      city: draft.city,
      website: draft.website,
      websiteStatus: "ok",
      status: "new",
      score: 0,
      reviewsCount: draft.reviewsCount ?? 0,
      websiteQualityTier: "",
      enrichedInfo: "",
      notes: "",
      phone: "",
      source: "queue-enrich",
      lastUpdated: now,
      email: draft.recipientEmail ?? "",
      emailSentAt: "", emailOpenedAt: "", emailClickedAt: "", emailStatus: "",
      followupSentAt: "", callbackDate: "",
    } as unknown as Lead;
    try {
      await saveShadow(await judgeLead(somLead, clients));
      vurderet++;
    } catch {
      /* en fejlet vurdering må ikke koste berigelsen — den prøves igen */
    }
  }

  await writeQueue(queue);
  const rest = queue.filter(mangler).length;
  return NextResponse.json({
    ok: true,
    beriget,
    vurderet,
    lukkede,
    udenFund,
    mangler: rest,
    brugt: `${(batch.length * KR_PR_OPSLAG).toFixed(2)} kr`,
  });
}

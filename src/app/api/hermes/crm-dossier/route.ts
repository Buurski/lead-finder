import { NextResponse } from "next/server";
import { and, eq, ilike, isNotNull } from "drizzle-orm";
import { getDb, pgEnabled } from "@/lib/db/client";
import { company } from "@/lib/db/schema";
import { dossierText, getDossier } from "@/lib/hq/dossier";
import { loadCustomerNotes } from "@/lib/hq/notes";
import { copenhagenNow } from "@/lib/settings";
import { verifyHermesRequest } from "@/lib/hermes-hmac";
import { cleanEnv } from "@/lib/hermes";

export const runtime = "nodejs";

// Læse-endpoint til Hermes' egne jobs (ugebrief, kundepleje …): CRM'et er facit,
// Sheets er frosset siden 22/9. Undtaget fra proxyens Basic auth; beskyttet af
// HMAC med HERMES_API_SECRET — samme skema som Hermes-shimmen:
//   X-Timestamp: <unix-sek>   Authorization: Bearer hex(hmac_sha256(secret, `${ts}.GET.${path}.`))
// hvor path = pathname + query (fx "/api/hermes/crm-dossier?q=vida").
//   ?list=clients   → kunder (id, navn, kundenr.)
//   ?q=<navn|uuid>  → kunde-mappe som tekst (+ matchende vault-viden)
function authorized(req: Request): boolean {
  return verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!pgEnabled()) return NextResponse.json({ ok: false, error: "CRM kører ikke på Postgres" }, { status: 503 });
  const url = new URL(req.url);
  const db = getDb();

  if (url.searchParams.get("list") === "clients") {
    const rows = await db
      .select({ id: company.id, name: company.name, clientNo: company.clientNo, lifecycle: company.lifecycle })
      .from(company)
      .where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false)));
    return NextResponse.json({ ok: true, clients: rows });
  }

  const q = (url.searchParams.get("q") || "").trim();
  if (!q || q.length > 120) return NextResponse.json({ ok: false, error: "q mangler" }, { status: 400 });
  const isId = /^[0-9a-f-]{36}$/i.test(q);
  const hits = await db
    .select({ id: company.id, name: company.name })
    .from(company)
    .where(and(eq(company.archived, false), isId ? eq(company.id, q) : ilike(company.name, `%${q.replace(/[%_\\]/g, "\\$&")}%`)))
    .limit(5);
  if (hits.length !== 1) {
    return NextResponse.json({ ok: hits.length > 1, ambiguous: hits.length > 1, candidates: hits }, { status: hits.length ? 200 : 404 });
  }
  const d = await getDossier(db, hits[0].id, { today: copenhagenNow().date, loadNotes: loadCustomerNotes });
  return NextResponse.json({ ok: true, id: hits[0].id, name: hits[0].name, dossier: d ? dossierText(d) : "" });
}

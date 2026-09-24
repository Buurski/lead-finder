// Læse-endpoint til Hermes-chatten og VPS-jobs: ét sted at hente CRM-tilstand.
// Undtaget fra proxyens Basic auth (api/agent/-præfikset); beskyttet af HMAC med
// HERMES_API_SECRET — samme skema som /api/agent/tasks og /api/hermes/crm-dossier:
//   X-Timestamp: <unix-sek>   Authorization: Bearer hex(hmac(secret, `${ts}.GET.${path}.`))
// hvor path = pathname + query (fx "/api/agent/read?what=sog&q=ktvvs").
// Kun læsning — ingen skrivninger her.
import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { getAgentFeed } from "@/lib/hq/agent-feed";
import { getAttention } from "@/lib/hq/attention";
import { cmsUsageAll } from "@/lib/hq/cms-usage";
import { listUpdates, type UpdateStatus } from "@/lib/hq/customer-updates";
import { listPipeline } from "@/lib/hq/deals";
import { searchAll } from "@/lib/hq/search";
import { listMyDay, type Owner } from "@/lib/hq/tasks";
import { cleanEnv } from "@/lib/hermes";
import { verifyHermesRequest } from "@/lib/hermes-hmac";
import { copenhagenNow } from "@/lib/settings";

export const runtime = "nodejs";

const WHATS = ["opmaerksomhed", "min-dag", "pipeline", "sog", "kundeopdateringer", "feed", "cms"] as const;

function authorized(req: Request): boolean {
  return verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET));
}

export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!pgEnabled()) return NextResponse.json({ ok: false, error: "CRM kører ikke på Postgres" }, { status: 503 });

  const url = new URL(req.url);
  const what = url.searchParams.get("what") || "";
  const db = getDb();
  const today = copenhagenNow().date;

  switch (what) {
    case "opmaerksomhed": {
      const items = await getAttention(db, { today });
      return NextResponse.json({ ok: true, today, items });
    }
    case "min-dag": {
      const ownerRaw = url.searchParams.get("owner") || "";
      const owner = (["lucas", "charlie"] as readonly string[]).includes(ownerRaw) ? (ownerRaw as Owner) : undefined;
      const items = await listMyDay(db, { owner, today });
      return NextResponse.json({ ok: true, today, items });
    }
    case "pipeline": {
      const cards = await listPipeline(db);
      return NextResponse.json({ ok: true, cards });
    }
    case "sog": {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q || q.length > 120) return NextResponse.json({ ok: false, error: "q mangler" }, { status: 400 });
      const groups = await searchAll(db, q);
      return NextResponse.json({ ok: true, q, groups });
    }
    case "kundeopdateringer": {
      const status = url.searchParams.get("status") || "kladde";
      const rows = await listUpdates(db, status as UpdateStatus);
      return NextResponse.json({ ok: true, status, rows });
    }
    case "feed": {
      const raw = Number(url.searchParams.get("limit")) || 20;
      const limit = Math.min(Math.max(raw, 1), 100);
      const rows = await getAgentFeed(db, limit);
      return NextResponse.json({ ok: true, rows });
    }
    case "cms": {
      const rows = await cmsUsageAll();
      return NextResponse.json({ ok: true, rows });
    }
    default:
      return NextResponse.json({ ok: false, error: "ukendt what", mulige: WHATS }, { status: 400 });
  }
}

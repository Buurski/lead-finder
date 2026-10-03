import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { copenhagenNow } from "@/lib/settings";
import { isCommandCenterRequest } from "@/lib/cc-auth";
import { createTask, listDone, listMyDay } from "@/lib/hq/tasks";
import { hqWrite, jsonBody } from "@/lib/hq/api";
import { scheduleCalendarSync, type CalOwner } from "@/lib/hq/gcal-sync";

export const runtime = "nodejs";

// Samme mønster som /api/virksomheder/search: en læse-rute kræver kun
// proxyens markør når auth overhovedet er sat op lokalt.
async function authorizedRead(req: Request): Promise<boolean> {
  const authConfigured = Boolean(process.env.VERCEL_BASIC_AUTH_USER && process.env.VERCEL_BASIC_AUTH_PASS && process.env.AUTH_SESSION_SECRET);
  if (!authConfigured) return true;
  return isCommandCenterRequest(req);
}

function ownerParam(url: URL): "lucas" | "charlie" | undefined {
  const o = url.searchParams.get("owner");
  return o === "lucas" || o === "charlie" ? o : undefined;
}

// GET ?owner=lucas|charlie&scope=dag|alle|klaret — den daglige arbejdsløkke.
export async function GET(req: Request) {
  if (!(await authorizedRead(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const owner = ownerParam(url);
  const scope = url.searchParams.get("scope") ?? "dag";
  const db = getDb();

  if (scope === "klaret") return NextResponse.json({ items: await listDone(db, { owner }) });

  const { date: today } = copenhagenNow();
  const all = await listMyDay(db, { owner, today });
  // Godkendelsesopgaver har som regel ingen dato og skal med i "Min dag", så de
  // kan ses og afgøres — også efter beslutningen (samme regel som OpgaverBoard).
  const items = scope === "alle" ? all : all.filter((i) => i.bucket === "forfalden" || i.bucket === "i_dag" || i.approval !== null);
  return NextResponse.json({ items });
}

// POST { companyId?, dealId?, owner, title, due?, dueTime? }
export async function POST(req: Request) {
  return hqWrite(req, async () => {
    const t = await createTask(getDb(), await jsonBody(req));
    scheduleCalendarSync(t.owner as CalOwner);
    return { task: t };
  });
}

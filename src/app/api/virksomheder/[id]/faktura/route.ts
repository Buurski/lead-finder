import { getDb } from "@/lib/db/client";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";
import { invoiceFromWork, unbilledWork } from "@/lib/hq/billing";
import { getBusinessSettings } from "@/lib/invoices";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → ufaktureret arbejde for virksomheden.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "ugyldigt id" }, { status: 400 });
  return NextResponse.json({ items: await unbilledWork(getDb(), id) });
}

// POST { activityIds: string[] } → faktura-kladde (sendes aldrig herfra).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async () => {
    const { id } = await ctx.params;
    const companyId = uuid(id, "virksomheds-id");
    const b = await jsonBody(req);
    const ids = Array.isArray(b.activityIds) ? b.activityIds.map((x) => uuid(x, "aktivitets-id")) : [];
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
    const invoice = await invoiceFromWork(getDb(), companyId, ids, { today, payerType: (await getBusinessSettings()).payerType });
    return { invoice };
  });
}

import { NextResponse } from "next/server";
import { getInvoice, saveInvoice, applyStatusChange, type InvoiceStatus } from "@/lib/invoices.ts";
import { assertWriteRequest } from "@/lib/cc-auth.ts";

// POST /api/invoices/[number]/status — manuelt statusskift (fra UI). Sætter
// paidAt/remindedAt timestamps ved overgang til "betalt"/"rykket".
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const VALID_STATUSES: InvoiceStatus[] = ["kladde", "sendt", "betalt", "forfalden", "rykket"];

export async function POST(req: Request, { params }: { params: Promise<{ number: string }> }) {
  try {
    await assertWriteRequest(req);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "afvist" }, { status: 403 });
  }
  const { number } = await params;
  const inv = await getInvoice(number);
  if (!inv) return NextResponse.json({ error: "invoice not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { status?: string };
  if (!body.status || !VALID_STATUSES.includes(body.status as InvoiceStatus)) {
    return NextResponse.json({ error: `ugyldig status — skal være en af: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
  }

  const status = body.status as InvoiceStatus;
  const updated = applyStatusChange(inv, status, new Date().toISOString());
  await saveInvoice(updated);

  return NextResponse.json({ ok: true, invoice: updated });
}

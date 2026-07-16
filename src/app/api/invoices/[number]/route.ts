import { NextResponse } from "next/server";
import { getInvoice, saveInvoice, type Invoice, type InvoiceLine } from "@/lib/invoices.ts";

// GET /api/invoices/[number] — enkelt faktura.
// PATCH /api/invoices/[number] — ret felter (datoer/linjer/modtager/note).
// Nummer og status rettes IKKE her (status har egen route, nummer er låst).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const invoice = await getInvoice(number);
  if (!invoice) return NextResponse.json({ error: "faktura findes ikke" }, { status: 404 });
  return NextResponse.json({ invoice });
}

interface PatchBody {
  issueDate?: string;
  dueDate?: string;
  lines?: InvoiceLine[];
  recipient?: Invoice["recipient"];
  note?: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const inv = await getInvoice(number);
  if (!inv) return NextResponse.json({ error: "faktura findes ikke" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as PatchBody;
  if (body.issueDate !== undefined && !ISO.test(body.issueDate)) {
    return NextResponse.json({ error: "issueDate skal være YYYY-MM-DD" }, { status: 400 });
  }
  if (body.dueDate !== undefined && !ISO.test(body.dueDate)) {
    return NextResponse.json({ error: "dueDate skal være YYYY-MM-DD" }, { status: 400 });
  }
  if (body.lines !== undefined) {
    if (!Array.isArray(body.lines) || body.lines.length === 0 || body.lines.some((l) => !l.description?.trim() || !(l.amount > 0))) {
      return NextResponse.json({ error: "lines skal have beskrivelse og beløb > 0" }, { status: 400 });
    }
  }

  const patched: Invoice = {
    ...inv,
    ...(body.issueDate !== undefined ? { issueDate: body.issueDate } : {}),
    ...(body.dueDate !== undefined ? { dueDate: body.dueDate } : {}),
    ...(body.lines !== undefined ? { lines: body.lines } : {}),
    ...(body.recipient !== undefined ? { recipient: body.recipient } : {}),
    ...(body.note !== undefined ? { note: body.note } : {}),
  };
  await saveInvoice(patched);
  return NextResponse.json({ ok: true, invoice: patched });
}

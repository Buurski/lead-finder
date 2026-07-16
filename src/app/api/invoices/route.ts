import { NextResponse } from "next/server";
import {
  listInvoices, saveInvoice, nextInvoiceNumber, addDays, getBusinessSettings,
  type Invoice, type InvoiceLine,
} from "@/lib/invoices.ts";

// GET /api/invoices — liste (nyeste først, allerede sorteret af listInvoices).
// POST /api/invoices — opret kladde: nummer via nextInvoiceNumber, dueDate = issueDate+14.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const invoices = await listInvoices();
  return NextResponse.json({ invoices });
}

interface CreateBody {
  clientName?: string;
  recipient?: { name?: string; att?: string; address?: string; cvr?: string };
  lines?: InvoiceLine[];
  note?: string;
  issueDate?: string; // valgfri, YYYY-MM-DD — til backfill af historiske fakturaer
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateBody;

  const recipientName = body.recipient?.name?.trim();
  if (!recipientName) return NextResponse.json({ error: "mangler modtagernavn" }, { status: 400 });

  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) return NextResponse.json({ error: "mindst én linje er påkrævet" }, { status: 400 });
  if (lines.some((l) => !l.description?.trim() || !(l.amount > 0))) {
    return NextResponse.json({ error: "hver linje skal have beskrivelse og beløb > 0" }, { status: 400 });
  }

  const biz = await getBusinessSettings();
  const issueDate = /^\d{4}-\d{2}-\d{2}$/.test(body.issueDate ?? "")
    ? (body.issueDate as string)
    : new Date().toISOString().slice(0, 10);
  const number = await nextInvoiceNumber(issueDate);

  const inv: Invoice = {
    number,
    clientName: body.clientName?.trim() || recipientName,
    recipient: {
      name: recipientName,
      att: body.recipient?.att,
      address: body.recipient?.address,
      cvr: body.recipient?.cvr,
    },
    issueDate,
    dueDate: addDays(issueDate, 14),
    lines,
    vatRate: 0,
    status: "kladde",
    payerType: biz.payerType,
    note: body.note,
  };

  await saveInvoice(inv);
  return NextResponse.json({ ok: true, invoice: inv });
}

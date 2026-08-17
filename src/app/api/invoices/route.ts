import { NextResponse } from "next/server";
import {
  listInvoices, saveInvoice, getInvoice, nextInvoiceNumber, addDays, getBusinessSettings,
  type Invoice, type InvoiceLine,
} from "@/lib/invoices.ts";
import { store } from "@/lib/store.ts";

// GET /api/invoices — liste (nyeste først, allerede sorteret af listInvoices).
// POST /api/invoices — opret kladde: nummer via nextInvoiceNumber, dueDate = issueDate+14.
//   Backfill/genskab: valgfrit `number` (fast fakturanr., fx efter en sletning) +
//   `dueDate` kan medsendes; number må ikke allerede findes.
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
  dueDate?: string; // valgfri, YYYY-MM-DD — ellers issueDate + 14
  number?: string; // valgfrit fast nr. (3 cifre) — genskab en slettet faktura uden at hoppe i serien
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as CreateBody;

  const recipientName = body.recipient?.name?.trim();
  if (!recipientName) return NextResponse.json({ error: "mangler modtagernavn" }, { status: 400 });

  const lines = Array.isArray(body.lines) ? body.lines : [];
  if (lines.length === 0) return NextResponse.json({ error: "mindst én linje er påkrævet" }, { status: 400 });
  if (lines.some((l) => !l.description?.trim() || !(l.amount > 0))) {
    return NextResponse.json({ error: "hver linje skal have beskrivelse og beløb > 0" }, { status: 400 });
  }

  const clientName = body.clientName?.trim() || recipientName;

  if (body.issueDate !== undefined && !ISO.test(body.issueDate)) {
    return NextResponse.json({ error: "issueDate skal være YYYY-MM-DD" }, { status: 400 });
  }
  if (body.dueDate !== undefined && !ISO.test(body.dueDate)) {
    return NextResponse.json({ error: "dueDate skal være YYYY-MM-DD" }, { status: 400 });
  }
  if (body.number !== undefined && !/^\d{3}$/.test(body.number)) {
    return NextResponse.json({ error: "number skal være 3 cifre (fx 005)" }, { status: 400 });
  }

  // Dublet-guard (kun ved auto-nummer): samme kunde + identiske linjer som en
  // eksisterende kladde → sandsynligvis et utilsigtet dobbeltklik. Et eksplicit
  // `number` er en bevidst genskabelse og springer guarden over.
  if (!body.number) {
    const existing = (await listInvoices()).find(
      (i) => i.status === "kladde" && i.clientName === clientName && JSON.stringify(i.lines) === JSON.stringify(lines),
    );
    if (existing) {
      return NextResponse.json({ error: `kladde findes allerede (faktura ${existing.number})` }, { status: 409 });
    }
  }

  const biz = await getBusinessSettings();
  const issueDate = ISO.test(body.issueDate ?? "")
    ? (body.issueDate as string)
    : new Date().toISOString().slice(0, 10);

  // Fast nr. medsendt (genskab slettet faktura): brug det uændret, afvis hvis det
  // allerede findes, og løft tælleren så den næste auto-faktura ikke kolliderer.
  let number: string;
  if (body.number) {
    if (await getInvoice(body.number)) {
      return NextResponse.json({ error: `faktura ${body.number} findes allerede` }, { status: 409 });
    }
    number = body.number;
    const counter = (await store.get<number>("invoice-counter/all")) ?? 0;
    if (Number(number) > counter) await store.put("invoice-counter/all", Number(number));
  } else {
    number = await nextInvoiceNumber(issueDate);
  }

  const inv: Invoice = {
    number,
    clientName,
    recipient: {
      name: recipientName,
      att: body.recipient?.att,
      address: body.recipient?.address,
      cvr: body.recipient?.cvr,
    },
    issueDate,
    dueDate: ISO.test(body.dueDate ?? "") ? (body.dueDate as string) : addDays(issueDate, 14),
    lines,
    vatRate: 0,
    status: "kladde",
    payerType: biz.payerType,
    note: body.note,
  };

  await saveInvoice(inv);
  return NextResponse.json({ ok: true, invoice: inv });
}

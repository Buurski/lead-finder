import { NextResponse } from "next/server";
import { getInvoice, saveInvoice, getBusinessSettings, invoiceTotal } from "@/lib/invoices.ts";
import { renderInvoicePdf } from "@/lib/invoice-pdf.tsx";
import { getTransporter, formatFrom } from "@/lib/senders.ts";
import { store } from "@/lib/store.ts";

// POST /api/invoices/[number]/send — kaldes KUN fra UI-knap (aldrig automatisk).
// Tilladt fra status "kladde" eller "sendt" (gen-send). Render PDF, arkivér i
// store, send mail m. attachment, sæt status "sendt" + sentAt. dueDate røres
// IKKE — den er sat ved oprettelse.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const inv = await getInvoice(number);
  if (!inv) return NextResponse.json({ error: "invoice not found" }, { status: 404 });
  if (inv.status !== "kladde" && inv.status !== "sendt") {
    return NextResponse.json({ error: `kan ikke sende faktura med status "${inv.status}"` }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { to?: string; subject?: string; body?: string };
  if (!body.to) return NextResponse.json({ error: "mangler modtager-email (to)" }, { status: 400 });

  const biz = await getBusinessSettings();

  try {
    const buf = await renderInvoicePdf(inv, biz);
    const { url: pdfUrl } = await store.putAsset(`invoices/faktura-${number}.pdf`, buf, "application/pdf");

    const { total } = invoiceTotal(inv);
    const month = new Date(inv.issueDate).toLocaleDateString("da-DK", { month: "long", year: "numeric" });
    const subject = body.subject || `Faktura ${number} — ${biz.name}`;
    const text =
      body.body ||
      `Hej ${inv.recipient.att || inv.recipient.name}\n\nHer er fakturaen for ${month} — ${total.toLocaleString("da-DK")} kr., betales senest ${new Date(inv.dueDate + "T00:00:00Z").toLocaleDateString("da-DK", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}.\n\nBetaling via bankoverførsel (nemt at kopiere herfra):\nReg.nr.: ${biz.bankReg}\nKontonr.: ${biz.bankAccount}\nBeløb: ${total.toLocaleString("da-DK")} kr.\n\nSig endelig til hvis noget driller.\n\nMvh ${biz.name}`;

    const transporter = getTransporter("lucas");
    await transporter.sendMail({
      from: formatFrom("lucas"),
      to: body.to,
      subject,
      text,
      attachments: [{ filename: `faktura-${number}.pdf`, content: buf }],
    });

    inv.status = "sendt";
    inv.sentAt = new Date().toISOString();
    inv.pdfUrl = pdfUrl;
    await saveInvoice(inv);

    return NextResponse.json({ ok: true, invoice: inv });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `send fejlede: ${message}` }, { status: 500 });
  }
}

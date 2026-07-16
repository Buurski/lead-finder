import { NextResponse } from "next/server";
import { getInvoice, getBusinessSettings } from "@/lib/invoices.ts";
import { renderInvoicePdf } from "@/lib/invoice-pdf.tsx";

// GET /api/invoices/[number]/pdf — on-demand PDF render, ikke lagret.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  const inv = await getInvoice(number);
  if (!inv) return NextResponse.json({ error: "invoice not found" }, { status: 404 });

  const biz = await getBusinessSettings();
  const buf = await renderInvoicePdf(inv, biz);

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="faktura-${number}.pdf"`,
    },
  });
}

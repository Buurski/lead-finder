import { NextResponse } from "next/server";
import { pgEnabled } from "@/lib/db/client.ts";
import { resolveInvoiceRecipient } from "@/lib/hq/invoice-contacts.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET → bedste gæt på modtager-mail, til at forudfylde send-dialogen. Fejler
// aldrig ud af 200 — et tomt "to" betyder bare "spørg selv".
export async function GET(_req: Request, ctx: { params: Promise<{ number: string }> }) {
  const { number } = await ctx.params;
  if (!pgEnabled()) return NextResponse.json({ to: "", source: "ingen" });
  try {
    return NextResponse.json(await resolveInvoiceRecipient(number));
  } catch {
    return NextResponse.json({ to: "", source: "ingen" });
  }
}

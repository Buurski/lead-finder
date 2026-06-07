import { NextResponse } from "next/server";
import { addClientManual } from "@/lib/sheets";

// POST /api/clients/add { name, branch?, phone?, monthlyFee?, setupFee? } — add a
// client row manually from the Klienter page. Read-write Sheets.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    await addClientManual({
      name,
      branch: b.branch ? String(b.branch) : "",
      phone: b.phone ? String(b.phone) : "",
      monthlyFee: b.monthlyFee ? String(b.monthlyFee) : "",
      setupFee: b.setupFee ? String(b.setupFee) : "",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

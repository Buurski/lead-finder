import { NextResponse } from "next/server";
import { updateClientFees } from "@/lib/sheets";
import { normalizeFeeInput } from "@/lib/money";

// POST { id, monthlyFee, setupFee } — manual revenue entry for one client.
// Writes only the two fee columns (G/H) for that row; touches nothing else.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    // Normalise to plain digit strings. An empty field clears intentionally; a
    // non-empty but unparseable value (a typo like "abc") is REJECTED rather
    // than silently written as blank — that would wipe the client's revenue.
    const monthlyFee = normalizeFeeInput(body.monthlyFee);
    const setupFee = normalizeFeeInput(body.setupFee);
    if (monthlyFee === null || setupFee === null) {
      return NextResponse.json({ error: "bad_fee", message: "fee must be a number or empty" }, { status: 400 });
    }

    await updateClientFees(id, monthlyFee, setupFee);
    return NextResponse.json({ ok: true, id, monthlyFee, setupFee });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update fees" }, { status: 500 });
  }
}

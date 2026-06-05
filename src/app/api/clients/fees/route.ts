import { NextResponse } from "next/server";
import { updateClientFees } from "@/lib/sheets";

// POST { id, monthlyFee, setupFee } — manual revenue entry for one client.
// Writes only the two fee columns (G/H) for that row; touches nothing else.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    // Normalise to plain digit strings (strip "kr", spaces, thousands dots).
    const clean = (v: unknown) => {
      const n = parseFloat(String(v ?? "").replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
      return Number.isFinite(n) ? String(Math.round(n)) : "";
    };
    const monthlyFee = clean(body.monthlyFee);
    const setupFee = clean(body.setupFee);

    await updateClientFees(id, monthlyFee, setupFee);
    return NextResponse.json({ ok: true, id, monthlyFee, setupFee });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update fees" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { updateClientDeal, type ClientDealPatch } from "@/lib/sheets";
import { normalizeFeeInput } from "@/lib/money";

// POST { id, stage?, monthlyFee?, setupFee?, wonDate?, expectedClose?, lostDate?,
//        source?, owner?, package?, markWon?, markLost? } — deal/forecast update
// for one client. Same store + write path as /api/clients/fees (Google Sheets
// Clients row); only the supplied fields are written. `markWon: true` sets
// stage=won + stamps wonDate=today; `markLost: true` sets stage=lost + stamps
// lostDate=today (both unless the corresponding date is given explicitly).
export const dynamic = "force-dynamic";

const VALID_STAGES = new Set([
  "lead", "contacted", "engaged", "concept", "offer", "negotiation",
  "won", "delivering", "live", "lost",
]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id ?? "").trim();
    if (!id) return NextResponse.json({ error: "missing id" }, { status: 400 });

    const patch: ClientDealPatch = {};

    // Fees reuse the same normalizer as the Klienter page — a typo is rejected,
    // never written as blank (which would wipe revenue).
    if (body.monthlyFee !== undefined) {
      const v = normalizeFeeInput(body.monthlyFee);
      if (v === null) return NextResponse.json({ error: "bad_fee", message: "monthlyFee must be a number or empty" }, { status: 400 });
      patch.monthlyFee = v;
    }
    if (body.setupFee !== undefined) {
      const v = normalizeFeeInput(body.setupFee);
      if (v === null) return NextResponse.json({ error: "bad_fee", message: "setupFee must be a number or empty" }, { status: 400 });
      patch.setupFee = v;
    }

    let stage: string | undefined = body.stage !== undefined ? String(body.stage).trim().toLowerCase() : undefined;

    // markWon / markLost: one-click convenience. Set the stage + stamp today's
    // date on the matching column (won_date / lost_date) unless one was passed.
    const today = new Date().toISOString().slice(0, 10);
    if (body.markWon) {
      stage = "won";
      if (body.wonDate === undefined) patch.wonDate = today;
    }
    if (body.markLost) {
      stage = "lost";
      if (body.lostDate === undefined) patch.lostDate = today;
    }

    if (stage !== undefined) {
      if (!VALID_STAGES.has(stage)) return NextResponse.json({ error: "bad_stage", message: `unknown stage: ${stage}` }, { status: 400 });
      patch.stage = stage;
    }

    for (const key of ["wonDate", "expectedClose", "lostDate"] as const) {
      if (body[key] !== undefined) {
        const v = String(body[key]).trim();
        if (v !== "" && !DATE_RE.test(v)) return NextResponse.json({ error: "bad_date", message: `${key} must be YYYY-MM-DD` }, { status: 400 });
        patch[key] = v;
      }
    }
    for (const key of ["source", "owner", "package"] as const) {
      if (body[key] !== undefined) patch[key] = String(body[key]).trim();
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "no_fields", message: "nothing to update" }, { status: 400 });
    }

    await updateClientDeal(id, patch);
    return NextResponse.json({ ok: true, id, patch });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update deal" }, { status: 500 });
  }
}

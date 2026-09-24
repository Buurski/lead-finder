import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, pgEnabled } from "@/lib/db/client";
import { countsAsSent } from "@/lib/draft-status";
import { company, outreach } from "@/lib/db/schema";
import { ANGLE_LABEL, DEFAULT_TOUCHES, GAP_DAYS, MAX_TOUCHES, nextAngle, type Angle } from "@/lib/hq/sequence";

export const dynamic = "force-dynamic";

const NOT_FOUND = {
  ok: true, found: false, sentCount: 0, history: [], maxTouches: DEFAULT_TOUCHES,
  nextStep: null, nextAngle: null, nextAngleLabel: null, nextDueAt: null,
  pendingDraft: false, stopped: false, stoppedReason: null,
} as const;

// GET /api/approve/sequence?leadId=<rowNo|placeId> — read-only oversigt til
// Indbakkens "sekvens"-sektion (spec §11): hvor mange mails er sendt til
// leadet, hvornår, og næste planlagte trin + vinkel. Bruger kun eksisterende
// tabeller/logik fra src/lib/hq/sequence.ts (nextAngle/GAP_DAYS) — ingen ny
// forretningslogik. leadId kan være det numeriske Sheets-rækkenummer (den
// normale kladde) ELLER en Google Place-ID-streng (kladder fra
// ingest-leadgen, før leadet er matchet til en company-række) — slå op på
// det id der faktisk findes.
export async function GET(req: Request) {
  const leadId = new URL(req.url).searchParams.get("leadId");
  if (!leadId) {
    return NextResponse.json({ ok: false, error: "ugyldigt leadId" }, { status: 400 });
  }
  if (!pgEnabled()) {
    // Sekvens-historik ligger kun i Postgres (outreach-tabellen) — ingen data uden pg.
    return NextResponse.json({
      ok: true, found: true, sentCount: 0, history: [], maxTouches: DEFAULT_TOUCHES,
      nextStep: null, nextAngle: null, nextAngleLabel: null, nextDueAt: null,
      stopped: false, stoppedReason: null,
    });
  }
  try {
    const db = getDb();
    const isNumeric = /^\d+$/.test(leadId);
    const [c] = isNumeric
      ? await db.select({ rowNo: company.rowNo, website: company.website, maxTouches: company.maxTouches })
          .from(company).where(eq(company.rowNo, Number(leadId)))
      : await db.select({ rowNo: company.rowNo, website: company.website, maxTouches: company.maxTouches })
          .from(company).where(eq(company.placeId, leadId));
    if (!c) {
      return NextResponse.json(NOT_FOUND);
    }
    const rowNo = c.rowNo;
    const rows = await db.select({
      step: outreach.step, angle: outreach.angle, status: outreach.status,
      updatedAt: outreach.updatedAt, draft: outreach.draft,
    }).from(outreach).where(eq(outreach.companyRowNo, rowNo));

    const sent = rows.filter((r) => countsAsSent(r.status)).sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
    const maxTouches = Math.min(c?.maxTouches ?? DEFAULT_TOUCHES, MAX_TOUCHES);
    const lastSent = sent.at(-1) ?? null;
    const nextStepNo = sent.length + 1;
    const hasOpen = rows.some((r) => r.status === "pending" || r.status === "edited" || r.status === "approved" || r.status === "sending");
    const stoppedRow = rows.find((r) => {
      const d = r.draft as { stoppedReason?: string } | null;
      return r.status === "rejected" && d?.stoppedReason;
    });
    const stoppedReason = stoppedRow ? (stoppedRow.draft as { stoppedReason?: string }).stoppedReason ?? null : null;

    // "Næste trin" regnes ud fra hvor mange der ER SENDT — uafhængigt af om der
    // allerede ligger en åben kladde til det (typisk DENNE kladde, når man kigger
    // på en opfølgning der venter på godkendelse), ellers ville widgeten fejlagtigt
    // sige "sekvensen er færdig" for en kladde der selv ER det næste trin.
    // Ligger trinnet allerede som åben kladde, bruges DENS egne step/angle (den
    // ægte værdi followUpDraft() valgte) i stedet for at genudregne en hypotetisk
    // vinkel, som kan afvige fra den kladden faktisk fik.
    const done = nextStepNo > maxTouches;
    const openRow = rows.find((r) => r.status === "pending" || r.status === "edited" || r.status === "approved") ?? null;
    const usedAngles = rows.map((r) => r.angle).filter((a): a is string => Boolean(a));
    const angle: Angle | null = stoppedReason || done
      ? null
      : openRow
        ? (openRow.angle as Angle | null) ?? null
        : nextAngle(nextStepNo, maxTouches, usedAngles, Boolean(c?.website));
    const nextDueAt = angle && !openRow && lastSent
      ? new Date(Date.parse(lastSent.updatedAt) + (GAP_DAYS[nextStepNo] ?? 0) * 86_400_000).toISOString()
      : null;

    return NextResponse.json({
      ok: true,
      found: true,
      sentCount: sent.length,
      history: sent.map((r) => ({ step: r.step, sentAt: r.updatedAt, angle: r.angle })),
      maxTouches,
      nextStep: angle ? (openRow?.step ?? nextStepNo) : null,
      nextAngle: angle,
      nextAngleLabel: angle ? ANGLE_LABEL[angle] : null,
      nextDueAt,
      pendingDraft: hasOpen,
      stopped: Boolean(stoppedReason),
      stoppedReason,
    });
  } catch (err) {
    console.error(JSON.stringify({ evt: "approve.sequence.failed", error: String(err).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "kunne ikke hente sekvens" }, { status: 500 });
  }
}

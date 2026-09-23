import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite, jsonBody } from "@/lib/hq/api";
import { recordReplyOutcome, ReplyOutcomeError, type ReplyOutcome } from "@/lib/hq/reply-outcome";
import { markReplyHandled } from "@/lib/inbox-digest";

export const runtime = "nodejs";

const OUTCOMES = new Set<ReplyOutcome>(["interesseret", "ikke-interesseret", "ring-op", "kunde-spoergsmaal", "andet"]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/replies/[leadId]/udfald { outcome, note?, followUpDue?, owner? }
// leadId = company.row_no (tal) ELLER company.place_id. Registrerer udfaldet
// (lead-status, stop af kolde kladder, tidslinje, valgfri opfølgningsopgave —
// se src/lib/hq/reply-outcome.ts) og markerer bedst-muligt den cachede
// indbakke-digest så svaret ikke dukker op som "kræver svar" igen ved næste
// hentning (digest-mutationen er best-effort — en fejl her må aldrig skjule
// at selve udfaldet blev gemt).
export async function POST(req: Request, ctx: { params: Promise<{ leadId: string }> }) {
  return hqWrite(req, async (actor) => {
    const { leadId } = await ctx.params;
    const b = await jsonBody(req);
    const outcome = String(b.outcome ?? "") as ReplyOutcome;
    if (!OUTCOMES.has(outcome)) throw new HqInputError("ukendt udfald");
    const note = typeof b.note === "string" ? b.note.trim() : "";
    if (note.length > 2000) throw new HqInputError("noten er for lang");
    let followUpDue: string | undefined;
    if (typeof b.followUpDue === "string" && b.followUpDue !== "") {
      if (!DATE_RE.test(b.followUpDue)) throw new HqInputError("ugyldig opfølgningsdato");
      followUpDue = b.followUpDue;
    }
    const owner = b.owner === "charlie" ? "charlie" : "lucas";

    let result;
    try {
      result = await recordReplyOutcome(getDb(), { leadId, outcome, note: note || undefined, followUpDue, owner, actor });
    } catch (err) {
      if (err instanceof ReplyOutcomeError) throw new HqInputError(err.message);
      throw err;
    }

    // Best-effort: udfaldet er allerede gemt; en fejl her må ikke fejle svaret.
    await markReplyHandled(leadId).catch(() => {});

    return { ok: true, ...result };
  });
}

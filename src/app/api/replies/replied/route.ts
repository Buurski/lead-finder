import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite, jsonBody } from "@/lib/hq/api";
import { findCompanyByEmail, recordReplyOutcome, ReplyOutcomeError } from "@/lib/hq/reply-outcome";
import { markItemHandled } from "@/lib/inbox-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/replies/replied { itemId, from, note?, date? } — "Svaret"-knappen på
// Svar-siden: Lucas/Charlie har svaret kunden manuelt i Gmail (appen sender
// aldrig selv). Svaret logges på kundens tidslinje med samme funktion som
// lead-udfaldene — så "hvem venter på hvem" vender rigtigt, og næste scan ser
// sammenhængen. Derefter skjules meddelelsen i Svar-listen (samme markering som
// "Fjern"): et NYERE svar i samme tråd dukker op igen, fordi markeringen
// tidsstemples med det viste svars tidspunkt.
//
// Rækkefølgen betyder noget: log FØRST i CRM, skjul DEREFTER. Fejler loggen,
// forbliver meddelelsen synlig i stedet for at forsvinde uden et spor.
export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const b = await jsonBody(req);
    const itemId = typeof b.itemId === "string" ? b.itemId.trim() : "";
    if (!itemId || itemId.length > 128) throw new HqInputError("ugyldigt itemId");
    const from = typeof b.from === "string" ? b.from.trim() : "";
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 300) : "";

    const db = getDb();
    const co = from ? await findCompanyByEmail(db, from) : null;
    if (co) {
      try {
        await recordReplyOutcome(db, { leadId: String(co.rowNo), outcome: "besvaret", note: note || undefined, owner: "lucas", actor });
      } catch (err) {
        if (err instanceof ReplyOutcomeError) throw new HqInputError(err.message);
        throw err;
      }
    }

    // Det VISTE svars tidspunkt (ikke "nu"): et svar der lander imens, forbliver synligt.
    const upTo = typeof b.date === "string" && !Number.isNaN(Date.parse(b.date)) ? new Date(b.date).toISOString() : undefined;
    // Best-effort: CRM-loggen er allerede gemt; en fejl her må ikke fejle svaret.
    await markItemHandled(itemId, upTo).catch(() => {});

    return { ok: true, logged: Boolean(co), company: co?.name ?? null };
  });
}

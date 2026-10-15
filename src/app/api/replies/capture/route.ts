import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite } from "@/lib/hq/api";
import { captureReplies } from "@/lib/capture-replies";
import { isMissingTable, safeError } from "@/lib/hq/lead-replies";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// POST /api/replies/capture — "Opdatér"-knappen på Har svaret: henter leads' seneste svar-mails (30 dage) fra begge
// Gmail-konti og gemmer uddrag i lead_reply. Læser kun mail; sender intet og ændrer ikke lead_status.
export async function POST(req: Request) {
  return hqWrite(req, async () => {
    try {
      const r = await captureReplies({ since: new Date(Date.now() - 30 * 86_400_000), db: getDb() });
      return { ok: true, inserted: r.inserted, matched: r.matched, errors: r.errors };
    } catch (err) {
      if (isMissingTable(err)) throw new HqInputError("Svar-uddrag er ikke slået til endnu (migration 0017 mangler).");
      throw new Error(safeError(err)); // aldrig rå drizzle-fejl: den rummer SQL-parametre (svar-uddrag)
    }
  });
}

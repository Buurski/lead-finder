import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite, jsonBody } from "@/lib/hq/api";
import { KundeRapportError, tjekHost, tjekMaaned } from "@/lib/hq/kunde-rapport";
import { sendKundeRapport } from "@/lib/hq/kunde-rapport-send";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { domaene, maaned: "ÅÅÅÅ-MM", til?, test? } — "Send nu" / "Send test" i HQ.
// Uden test: mailen går til kunden (til = rettet adresse, ellers kundens kontakt),
// og rapporten markeres sendt og fryses. Med test: kun til `til`, intet markeres.
export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const b = await jsonBody(req);
    try {
      const [host, ym] = [tjekHost(b.domaene), tjekMaaned(b.maaned)];
      const r = await sendKundeRapport(getDb(), host, ym, actor, { til: typeof b.til === "string" ? b.til : undefined, test: b.test === true });
      return { ok: true, ...r };
    } catch (err) {
      if (err instanceof KundeRapportError) throw new HqInputError(err.message);
      throw err;
    }
  });
}

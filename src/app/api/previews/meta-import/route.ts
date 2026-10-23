import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite, jsonBody } from "@/lib/hq/api";
import { importMetaLeads, MetaImportError } from "@/lib/hq/meta-leads";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { csv } — Leads Center-CSV'en (allerede afkodet til tekst i browseren). Kun
// Lucas/Charlie (hqWrite). Opretter henvendelser; sender intet til leads.
export async function POST(req: Request) {
  return hqWrite(req, async () => {
    const body = await jsonBody(req);
    if (typeof body.csv !== "string" || !body.csv.trim()) throw new HqInputError("vælg en CSV-fil fra Leads Center");
    if (body.csv.length > 2_000_000) throw new HqInputError("filen er for stor (over 2 MB)");
    try {
      const result = await importMetaLeads(getDb(), body.csv);
      // Som linkPreview: en der selv har henvendt sig, skal ikke have en kold kladde.
      const rows = result.created.map((c) => c.rowNo).filter((n) => n > 0);
      if (rows.length) {
        const { stopOpenForRows } = await import("@/lib/pg/queue");
        await stopOpenForRows(rows, "henvendte sig via Meta-annonce", new Date().toISOString()).catch((e) =>
          console.error(JSON.stringify({ evt: "meta_import.stop_failed", error: String(e).slice(0, 200) })),
        );
      }
      return result;
    } catch (err) {
      if (err instanceof MetaImportError) throw new HqInputError(err.message);
      throw err;
    }
  });
}

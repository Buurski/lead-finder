import { HqInputError, hqWrite, jsonBody } from "@/lib/hq/api";
import { gemPersonligNote, KundeRapportError } from "@/lib/hq/kunde-rapport";

export const runtime = "nodejs";

// PUT { domaene, maaned: "ÅÅÅÅ-MM", tekst } — Lucas' personlige linje til kunden i månedens rapport.
export async function PUT(req: Request) {
  return hqWrite(req, async () => {
    const b = await jsonBody(req);
    try {
      return { ok: true, tekst: await gemPersonligNote(String(b.domaene ?? ""), String(b.maaned ?? ""), b.tekst) };
    } catch (err) {
      if (err instanceof KundeRapportError) throw new HqInputError(err.message);
      throw err;
    }
  });
}

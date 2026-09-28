import { hqWrite, jsonBody, HqInputError } from "@/lib/hq/api";
import { getDb } from "@/lib/db/client";
import { KundeRapportError, kortLevering, rapportFor, saetLevering, tjekHost, tjekMaaned } from "@/lib/hq/kunde-rapport";

export const runtime = "nodejs";

// PATCH { domaene, maaned: "ÅÅÅÅ-MM", status: "sendt" | "sprunget" | "aaben", grund? }
// Lucas sender selv fra Gmail; her markeres kun at det er sket.
export async function PATCH(req: Request) {
  return hqWrite(req, async (actor) => {
    const b = await jsonBody(req);
    try {
      const status = b.status;
      if (status !== "sendt" && status !== "sprunget" && status !== "aaben") throw new KundeRapportError("status skal være sendt, sprunget eller aaben");
      const [host, ym] = [tjekHost(b.domaene), tjekMaaned(b.maaned)];
      // "Sendt" fryser rapporten, som den ser ud nu, så PDF'en kan genskabes præcis.
      const rapport = status === "sendt" ? await rapportFor(getDb(), host, ym) : null;
      const levering = await saetLevering(host, ym, status, actor, typeof b.grund === "string" ? b.grund : undefined, new Date(), rapport);
      return { ok: true, levering: kortLevering(levering) };
    } catch (err) {
      if (err instanceof KundeRapportError) throw new HqInputError(err.message);
      throw err;
    }
  });
}

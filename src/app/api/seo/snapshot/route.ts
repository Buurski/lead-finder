import { getDb } from "@/lib/db/client";
import { hqWrite, HqInputError, jsonBody, uuid } from "@/lib/hq/api";
import { customerSites, recordSeoSnapshot } from "@/lib/hq/seo-history";

export const maxDuration = 90;

export async function POST(req: Request) {
  return hqWrite(req, async () => {
    const body = await jsonBody(req);
    const companyId = body.companyId == null ? null : uuid(body.companyId, "kunde-id");
    const db = getDb();
    let url = "https://kinly.dk/";
    if (companyId) {
      const target = (await customerSites(db)).find((item) => item.companyId === companyId);
      if (!target) throw new HqInputError("Kunden har ikke et live site");
      url = target.url;
    }
    const result = await recordSeoSnapshot(db, url, companyId);
    return { ok: result.saved, reason: result.reason };
  });
}

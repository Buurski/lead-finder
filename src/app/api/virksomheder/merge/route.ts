import { getDb } from "@/lib/db/client";
import { mergeCompanies } from "@/lib/pg/merge";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

// POST { keepId, dropId } — flet to virksomheder (drop arkiveres, intet slettes).
export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const b = await jsonBody(req);
    await mergeCompanies(getDb(), uuid(b.keepId), uuid(b.dropId), actor);
    return { ok: true };
  });
}

import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite, jsonBody, uuid } from "@/lib/hq/api";
import { PhaseError, setPhase } from "@/lib/hq/phase";
import { stopOpenForRows } from "@/lib/pg/queue";

export const runtime = "nodejs";

// POST { fase: "ny" | "interesseret" | "tabt" | "ikke_egnet" }
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const b = await jsonBody(req);
    try {
      const r = await setPhase(getDb(), uuid(id, "virksomheds-id"), b.fase, actor);
      const stopped = r.stopDrafts ? await stopOpenForRows([r.rowNo], `fase sat af ${actor}`, new Date().toISOString()) : 0;
      return { ok: true, lifecycle: r.lifecycle, stoppedDrafts: stopped };
    } catch (err) {
      if (err instanceof PhaseError) throw new HqInputError(err.message);
      throw err;
    }
  });
}

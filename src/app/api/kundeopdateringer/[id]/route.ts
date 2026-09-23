import { getDb } from "@/lib/db/client";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";
import { setUpdate } from "@/lib/hq/customer-updates";

export const runtime = "nodejs";

// PATCH { subject?, body?, to?, status?: "sendt" | "kasseret" }
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const b = await jsonBody(req);
    await setUpdate(getDb(), uuid(id, "kladde-id"), b as never, actor);
    return { ok: true };
  });
}

import { getDb } from "@/lib/db/client";
import { deleteHqTask, patchDealNextStep, patchTask } from "@/lib/hq/tasks";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

// PATCH { done?, due?, title?, owner? } — id er enten et opgave-id, eller
// "deal:<aftale-id>" for en aftales næste skridt (se NextStepsTable/OpgaverBoard).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const body = await jsonBody(req);
    if (id.startsWith("deal:")) {
      return { item: await patchDealNextStep(getDb(), uuid(id.slice(5), "aftale-id"), body, actor) };
    }
    return { item: await patchTask(getDb(), uuid(id, "opgave-id"), body, actor) };
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    await deleteHqTask(getDb(), uuid(id, "opgave-id"), actor);
    return { ok: true };
  });
}

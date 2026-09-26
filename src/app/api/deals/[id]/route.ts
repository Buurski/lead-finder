import { getDb } from "@/lib/db/client";
import { deleteDeal, updateDeal } from "@/lib/hq/deals";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

// PATCH { stage?, title?, valueDkk?, mrrDkk?, owner?, nextStep?, nextStepDue? }
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    return { deal: await updateDeal(getDb(), uuid(id, "aftale-id"), await jsonBody(req), actor) };
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    return await deleteDeal(getDb(), uuid(id, "aftale-id"), actor);
  });
}

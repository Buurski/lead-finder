import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { deal, task } from "@/lib/db/schema";
import { deleteHqTask, patchDealNextStep, patchTask } from "@/lib/hq/tasks";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";
import { scheduleCalendarSync, type CalOwner } from "@/lib/hq/gcal-sync";

export const runtime = "nodejs";

// Skift af ejer kræver sync af BEGGE kalendre (den gamle skal miste begivenheden,
// den nye skal have den) — derfor slås ejeren op før ændringen skrives.
function sync(before: string | undefined, after: string) {
  scheduleCalendarSync(after as CalOwner);
  if (before && before !== after) scheduleCalendarSync(before as CalOwner);
}

// PATCH { done?, due?, dueTime?, title?, owner? } — id er enten et opgave-id, eller
// "deal:<aftale-id>" for en aftales næste skridt (se NextStepsTable/OpgaverBoard).
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const body = await jsonBody(req);
    if (id.startsWith("deal:")) {
      const dealId = uuid(id.slice(5), "aftale-id");
      const [before] = await getDb().select({ owner: deal.owner }).from(deal).where(eq(deal.id, dealId));
      const item = await patchDealNextStep(getDb(), dealId, body, actor);
      sync(before?.owner, item.owner);
      return { item };
    }
    const taskId = uuid(id, "opgave-id");
    const [before] = await getDb().select({ owner: task.owner }).from(task).where(eq(task.id, taskId));
    const item = await patchTask(getDb(), taskId, body, actor);
    sync(before?.owner, item.owner);
    return { item };
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const taskId = uuid(id, "opgave-id");
    const [before] = await getDb().select({ owner: task.owner }).from(task).where(eq(task.id, taskId));
    await deleteHqTask(getDb(), taskId, actor);
    if (before) scheduleCalendarSync(before.owner as CalOwner);
    return { ok: true };
  });
}

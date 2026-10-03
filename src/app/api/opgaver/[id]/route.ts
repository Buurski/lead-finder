import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { deal, task } from "@/lib/db/schema";
import { decideApproval, deleteHqTask, patchDealNextStep, patchTask } from "@/lib/hq/tasks";
import { hqWrite, jsonBody, uuid, HqInputError } from "@/lib/hq/api";
import { DealInputError } from "@/lib/hq/deals";
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
    // Godkend/afvis er sit eget flow: aktøren kommer fra hqWrite (serverens
    // currentUser), aldrig fra body, og må ikke blandes med redigeringer.
    if (body.decision !== undefined) {
      if (id.startsWith("deal:")) throw new HqInputError("aftalers næste skridt kan ikke godkendes");
      if (Object.keys(body).some((k) => k !== "decision")) throw new DealInputError("beslutning kan ikke kombineres med andre ændringer");
      const taskId = uuid(id, "opgave-id");
      const item = await decideApproval(getDb(), taskId, body.decision, actor);
      return { item };
    }
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

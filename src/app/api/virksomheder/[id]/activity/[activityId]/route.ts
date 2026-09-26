import { getDb } from "@/lib/db/client";
import { deleteNote, updateNote } from "@/lib/hq/activity-note";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

// PATCH { summary } — kun egne "note"-hændelser.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; activityId: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id, activityId } = await ctx.params;
    const b = await jsonBody(req);
    return { activity: await updateNote(getDb(), uuid(activityId, "note-id"), uuid(id, "virksomheds-id"), b.summary, actor) };
  });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; activityId: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id, activityId } = await ctx.params;
    return await deleteNote(getDb(), uuid(activityId, "note-id"), uuid(id, "virksomheds-id"), actor);
  });
}

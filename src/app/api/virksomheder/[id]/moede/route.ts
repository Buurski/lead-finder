import { getDb } from "@/lib/db/client";
import { bookMeeting } from "@/lib/hq/meetings";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";
import { scheduleCalendarSync, type CalOwner } from "@/lib/hq/gcal-sync";

export const runtime = "nodejs";

// POST { due: ÅÅÅÅ-MM-DD, dueTime: TT:MM, place?, owner? } — Book møde: opgave med tid + aftale i trinnet Møde.
// Sender intet og inviterer ingen; mødet lægges kun i ejerens egen HQ-kalender (gcal-sync).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const b = await jsonBody(req);
    const owner = b.owner === "charlie" || b.owner === "lucas" ? b.owner : actor === "charlie" ? "charlie" : "lucas";
    const r = await bookMeeting(getDb(), { companyId: uuid(id, "virksomheds-id"), owner, due: b.due, dueTime: b.dueTime, place: b.place, actor });
    scheduleCalendarSync(owner as CalOwner);
    return r;
  });
}

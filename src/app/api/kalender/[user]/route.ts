import { timingSafeEqual } from "node:crypto";
import { and, eq, isNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { task } from "@/lib/db/schema";
import { calendarToken, tasksToIcs } from "@/lib/hq/calendar";

export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: Promise<{ user: string }> }) {
  const { user } = await ctx.params;
  const secret = process.env.AUTH_SESSION_SECRET;
  const provided = new URL(req.url).searchParams.get("t");
  if (!secret || (user !== "lucas" && user !== "charlie") || !provided || !/^[0-9a-f]{64}$/.test(provided)) return new Response(null, { status: 404 });
  const expected = Buffer.from(calendarToken(user, secret), "hex");
  if (!timingSafeEqual(Buffer.from(provided, "hex"), expected)) return new Response(null, { status: 404 });
  const rows = await getDb().select({ id: task.id, title: task.title, due: task.due, clientName: task.clientName, note: task.note }).from(task).where(and(eq(task.owner, user), isNull(task.doneAt), ne(task.due, "")));
  return new Response(tasksToIcs(rows, new Date()), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `inline; filename="kinly-${user}.ics"`, "Cache-Control": "private, no-store" } });
}

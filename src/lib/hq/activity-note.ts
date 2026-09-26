// Ret/slet en note på tidslinjen. Kun "note"-typen, og kun menneske-skrevne
// (aldrig system/claude/hermes) — de andre typer (mails, fase, kunde, faktura…)
// er historik der ikke må laves om.
import "server-only";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity } from "../db/schema.ts";

export class NoteError extends Error {}

const HUMAN_ACTORS = new Set(["lucas", "charlie"]);

function noteText(v: unknown): string {
  const t = typeof v === "string" ? v.trim() : "";
  if (!t) throw new NoteError("tekst mangler");
  if (t.length > 2000) throw new NoteError("tekst er for lang");
  return t;
}

async function loadEditableNote(db: Db, activityId: string, companyId: string) {
  const [row] = await db.select().from(activity).where(and(eq(activity.id, activityId), eq(activity.companyId, companyId)));
  if (!row) throw new NoteError("noten findes ikke");
  if (row.type !== "note") throw new NoteError("kun noter kan rettes eller slettes");
  if (!HUMAN_ACTORS.has(row.actor)) throw new NoteError("systemnoter kan ikke rettes eller slettes");
  return row;
}

export async function updateNote(db: Db, activityId: string, companyId: string, summary: unknown) {
  const row = await loadEditableNote(db, activityId, companyId);
  const text = noteText(summary);
  const payload = { ...((row.payload as Record<string, unknown> | null) ?? {}), edited: true };
  const [after] = await db.update(activity).set({ summary: text, payload }).where(eq(activity.id, activityId)).returning();
  return after;
}

export async function deleteNote(db: Db, activityId: string, companyId: string) {
  await loadEditableNote(db, activityId, companyId);
  await db.delete(activity).where(eq(activity.id, activityId));
  return { id: activityId };
}

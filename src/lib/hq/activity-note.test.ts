import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";
import { deleteNote, NoteError, updateNote } from "./activity-note.ts";

let db: Db;
let companyId: string;
beforeEach(async () => {
  db = await freshTestDb();
  [{ id: companyId }] = await db.insert(company).values({ rowNo: 9, name: "Ikast AutoService" }).returning({ id: company.id });
});

test("retter en egen note og markerer den redigeret", async () => {
  const [n] = await db.insert(activity).values({ companyId, actor: "lucas", type: "note", summary: "Første" }).returning();
  const after = await updateNote(db, n.id, companyId, "Rettet tekst", "lucas");
  assert.equal(after.summary, "Rettet tekst");
  assert.deepEqual(after.payload, { edited: true });
});

test("sletter en egen note", async () => {
  const [n] = await db.insert(activity).values({ companyId, actor: "charlie", type: "note", summary: "Slet mig" }).returning();
  await deleteNote(db, n.id, companyId, "charlie");
  assert.deepEqual(await db.select().from(activity).where(eq(activity.id, n.id)), []);
});

test("afviser ikke-note-typer", async () => {
  const [a] = await db.insert(activity).values({ companyId, actor: "lucas", type: "fase", summary: "Aftalt" }).returning();
  await assert.rejects(updateNote(db, a.id, companyId, "ny tekst", "lucas"), NoteError);
  await assert.rejects(deleteNote(db, a.id, companyId, "lucas"), NoteError);
});

test("afviser system-/agent-noter", async () => {
  const [n] = await db.insert(activity).values({ companyId, actor: "hermes", type: "note", summary: "Auto-note" }).returning();
  await assert.rejects(updateNote(db, n.id, companyId, "ny tekst", "lucas"), NoteError);
  await assert.rejects(deleteNote(db, n.id, companyId, "lucas"), NoteError);
});

test("tom tekst og forkert virksomhed afvises", async () => {
  const [n] = await db.insert(activity).values({ companyId, actor: "lucas", type: "note", summary: "Original" }).returning();
  await assert.rejects(updateNote(db, n.id, companyId, "  ", "lucas"), NoteError);
  await assert.rejects(updateNote(db, n.id, "00000000-0000-0000-0000-000000000000", "ny tekst", "lucas"), NoteError);
});

test("Charlie kan ikke rette eller slette Lucas' note", async () => {
  const [n] = await db.insert(activity).values({ companyId, actor: "lucas", type: "note", summary: "Lucas' note" }).returning();
  await assert.rejects(updateNote(db, n.id, companyId, "ny tekst", "charlie"), NoteError);
  await assert.rejects(deleteNote(db, n.id, companyId, "charlie"), NoteError);
});

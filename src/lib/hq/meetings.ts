// Møder uden ny tabel: et møde er en opgave med dato + klokkeslæt, mærket `task.data.kind = "moede"`,
// koblet til en aftale i trinnet "Møde". Kalenderen (gcal-sync) giver mødeopgaver 60 min + 2 påmindelser.
// Efter mødet opretter en timecron præcis én opfølgningsopgave ("Hvordan gik mødet?").
import "server-only";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, deal, task } from "../db/schema.ts";
import { copenhagenNow } from "../settings.ts";
import { createDeal, DealInputError, normalizeStage, updateDeal } from "./deals.ts";
import { createTask } from "./tasks.ts";

export const MEETING_MINUTES = 60;

export interface BookMeetingInput {
  companyId: unknown;
  owner: unknown;
  due: unknown; // ÅÅÅÅ-MM-DD
  dueTime: unknown; // TT:MM (påkrævet)
  place?: unknown; // sted / telefon
  actor: string;
}

/**
 * Book møde: opgave "Møde" med dato+tid (og sted i noten) + aftale i trinnet "Møde".
 * Aftalen: en åben aftale i Møde/Tilbud genbruges (flyttes til Møde); ellers oprettes en ny.
 * Aftaler længere fremme (aftalt, i gang …) flyttes aldrig tilbage — dér oprettes en ny.
 */
export async function bookMeeting(db: Db, p: BookMeetingInput) {
  if (typeof p.dueTime !== "string" || !p.dueTime) throw new DealInputError("klokkeslæt mangler");
  if (typeof p.due !== "string" || !p.due) throw new DealInputError("dato mangler");
  const place = typeof p.place === "string" ? p.place.trim() : "";
  if (place.length > 200) throw new DealInputError("sted er for langt");
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as Db;
    // Serialisér pr. virksomhed: lås virksomhedsrækken, læs så aftalerne (låst) og vælg EFTER låsen.
    const [c] = await tx.select({ id: company.id, name: company.name }).from(company).where(eq(company.id, String(p.companyId))).for("update");
    if (!c) throw new DealInputError("virksomheden findes ikke");
    const existing = (await tx.select().from(deal).where(eq(deal.companyId, c.id)).for("update"))
      .filter((d) => ["moede", "tilbud"].includes(normalizeStage(d.stage)))
      .sort((a, b) => Number(normalizeStage(b.stage) === "moede") - Number(normalizeStage(a.stage) === "moede") || b.updatedAt.getTime() - a.updatedAt.getTime())[0];
    const d = existing
      ? normalizeStage(existing.stage) === "moede" ? existing : await updateDeal(tx, existing.id, { stage: "moede" }, p.actor)
      : await createDeal(tx, c.id, { title: "Møde", stage: "moede", owner: p.owner }, p.actor);
    const t = await createTask(tx, { companyId: c.id, dealId: d.id, owner: p.owner, title: "Møde", due: p.due, dueTime: p.dueTime });
    const [row] = await tx.update(task).set({ note: place, data: { kind: "moede" } }).where(eq(task.id, t.id)).returning();
    await tx.insert(activity).values({ companyId: c.id, dealId: d.id, actor: p.actor, type: "opgave", summary: `Møde booket: ${p.due} kl. ${p.dueTime}${place ? ` (${place})` : ""}` });
    return { task: row, deal: d };
  });
}

/** Klokkeslæt i København → UTC-millisekunder (DST-korrekt, to-trins offset). */
export function copenhagenInstant(day: string, time: string): number {
  const [y, mo, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wallAsUtc = Date.UTC(y, mo - 1, d, hh, mm);
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Copenhagen", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const offsetAt = (ms: number) => {
    const w = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(Number(w.year), Number(w.month) - 1, Number(w.day), Number(w.hour), Number(w.minute)) - ms;
  };
  const off1 = offsetAt(wallAsUtc);
  const t1 = wallAsUtc - off1;
  const off2 = offsetAt(t1);
  return off2 === off1 ? t1 : wallAsUtc - off2;
}

/**
 * Cron "mødeudfald": for hver mødeopgave hvis møde (start + 60 min) er slut, oprettes præcis én
 * opgave "Hvordan gik mødet? Ryk aftalen til Tilbud eller Tabt", og mødeopgaven lukkes (doneAt) i samme
 * transaktion. Idempotent: opfølgningen bærer `data.moedeId`, og hele kørslen tager en advisory-lås,
 * så to samtidige kørsler ikke giver dubletter. Intet aldersvindue: alle åbne, afsluttede møder tages.
 */
export async function sweepMeetingOutcomes(db: Db, now = new Date()): Promise<{ created: number }> {
  const today = copenhagenNow(now).date;
  return db.transaction(async (tx0) => {
    const tx = tx0 as unknown as Db;
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('moede-udfald'))`);
    const meetings = await tx.select().from(task).where(and(sql`${task.data}->>'kind' = 'moede'`, isNull(task.doneAt), lte(task.due, today), sql`${task.dueTime} <> ''`));
    const ended = meetings.filter((mt) => copenhagenInstant(mt.due, mt.dueTime) + MEETING_MINUTES * 60_000 <= now.getTime());
    if (!ended.length) return { created: 0 };
    // Ét opslag efter eksisterende udfald for alle afsluttede møder.
    const have = new Set(
      (await tx.select({ id: sql<string>`${task.data}->>'moedeId'` }).from(task)
        .where(and(sql`${task.data}->>'kind' = 'moede-udfald'`, inArray(sql`${task.data}->>'moedeId'`, ended.map((m) => m.id))))).map((r) => r.id),
    );
    const fresh = ended.filter((mt) => !have.has(mt.id));
    if (fresh.length) {
      await tx.insert(task).values(fresh.map((mt) => ({
        companyId: mt.companyId,
        dealId: mt.dealId,
        clientName: mt.clientName,
        owner: mt.owner,
        title: `Hvordan gik mødet${mt.clientName ? ` med ${mt.clientName}` : ""}? Ryk aftalen til Tilbud eller Tabt`,
        due: mt.due,
        data: { kind: "moede-udfald", moedeId: mt.id },
      })));
    }
    // Mødet er slut: luk mødeopgaven (også ældre, der allerede har udfald), så kalenderen ikke rykker den hver dag.
    await tx.update(task).set({ doneAt: now }).where(inArray(task.id, ended.map((m) => m.id)));
    return { created: fresh.length };
  });
}

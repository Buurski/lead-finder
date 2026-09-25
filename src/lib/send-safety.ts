// Send-vejens to atomiske værn (Sol-review 25/9):
// 1) én send-kørsel ad gangen — compare-and-set i Postgres, ikke KV get→put;
// 2) en SMTP-fejl gør kun kladden sendbar igen, når serveren med sikkerhed IKKE tog mailen.
import { and, eq, gt, lt, lte, sql } from "drizzle-orm";
import { getDb, pgEnabled } from "./db/client.ts";
import { counter } from "./db/schema.ts";
import { store } from "./store.ts";

const LOCK_NAME = "send-lock";
const KV_LOCK_KEY = "send/lock";

/** Tager låsen hvis den er fri/udløbet. Returnerer et håndtag til release, eller null (optaget). */
export async function acquireSendLock(ttlMs: number, nowMs = Date.now()): Promise<number | null> {
  const until = Math.ceil((nowMs + ttlMs) / 1000);
  const nowSec = Math.floor(nowMs / 1000);
  if (pgEnabled()) {
    // ponytail: epoch-sekunder i counter.value (int4) holder til 2038.
    const rows = await getDb()
      .insert(counter)
      .values({ name: LOCK_NAME, value: until })
      .onConflictDoUpdate({ target: counter.name, set: { value: until }, setWhere: lte(counter.value, nowSec) })
      .returning({ name: counter.name });
    return rows.length === 1 ? until : null;
  }
  const lock = await store.get<{ until: number }>(KV_LOCK_KEY).catch(() => null);
  if (lock && typeof lock.until === "number" && lock.until > nowMs) return null;
  await store.put(KV_LOCK_KEY, { until: until * 1000, startedAt: new Date(nowMs).toISOString() });
  return until;
}

/** Frigiver kun egen lås (samme håndtag) — en overtaget, udløbet lås røres ikke. */
export async function releaseSendLock(handle: number): Promise<void> {
  if (pgEnabled()) {
    await getDb().delete(counter).where(and(eq(counter.name, LOCK_NAME), eq(counter.value, handle)));
    return;
  }
  const lock = await store.get<{ until: number }>(KV_LOCK_KEY).catch(() => null);
  if (lock && lock.until === handle * 1000) await store.delete(KV_LOCK_KEY);
}

/** Er en send-kørsel i gang lige nu? (kun til GET-preflightens "busy"). */
export async function sendLockHeld(nowMs = Date.now()): Promise<boolean> {
  if (pgEnabled()) {
    const rows = await getDb().select({ name: counter.name }).from(counter).where(and(eq(counter.name, LOCK_NAME), gt(counter.value, Math.floor(nowMs / 1000))));
    return rows.length > 0;
  }
  const lock = await store.get<{ until: number }>(KV_LOCK_KEY).catch(() => null);
  return Boolean(lock && typeof lock.until === "number" && lock.until > nowMs);
}

// Nodemailer-koder der kun opstår FØR beskeden afleveres (login, DNS, modtagere, TLS).
// ECONNECTION er IKKE med: nodemailer giver den også når forbindelsen lukker mens
// svaret på DATA venter — mailen kan være modtaget (Sol R2).
const BEFORE_ACCEPT = new Set(["EAUTH", "EDNS", "EENVELOPE", "ETLS", "EREQUIRETLS"]);

/** true = serveren tog med sikkerhed ikke imod mailen (sikker at prøve igen).
 *  false = tvetydigt (timeout/socket efter DATA) → bliv i "sending", afstem manuelt. */
export function failedBeforeAccept(err: unknown): boolean {
  const e = err as { code?: unknown; responseCode?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  if (typeof e.responseCode === "number" && e.responseCode >= 400) return true; // serveren svarede nej
  return typeof e.code === "string" && BEFORE_ACCEPT.has(e.code);
}

// Dagligt budget pr. mailkonto (plan C2 + Sol-inspektion bølge 2): nyt domæne ⇒ max 20
// prospekt-mails pr. konto pr. dansk kalenderdag, delt af kold-køen og preview-send.
// Tages atomisk ved hvert SMTP-forsøg (et tvetydigt forsøg kan være gået ud) og kan
// aldrig flytte dag bagefter — i modsætning til en optælling ud fra kladdernes updatedAt.
// Et forsøg der bagefter afvises af reservationen bruger stadig en plads (sikker retning).
export const DAILY_SEND_CAP = 20;
const cphDay = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
const budgetKey = (sender: string, nowMs: number) => `send-day:${sender}:${cphDay(nowMs)}`;

/** Tager én plads i dagens budget. false = loftet er nået (send ikke). */
export async function takeDailyBudget(sender: string, nowMs = Date.now(), cap = DAILY_SEND_CAP): Promise<boolean> {
  const name = budgetKey(sender, nowMs);
  if (pgEnabled()) {
    const rows = await getDb()
      .insert(counter)
      .values({ name, value: 1 })
      .onConflictDoUpdate({ target: counter.name, set: { value: sql`${counter.value} + 1` }, setWhere: lt(counter.value, cap) })
      .returning({ value: counter.value });
    return rows.length === 1;
  }
  // ponytail: KV-udgaven er læs-ændr-skriv (kun lokal/test); prod kører pg.
  const used = (await store.get<number>(name).catch(() => null)) ?? 0;
  if (used >= cap) return false;
  await store.put(name, used + 1);
  return true;
}

/** Hvor mange pladser er brugt i dag (kun til GET-preflight). */
export async function dailyBudgetUsed(sender: string, nowMs = Date.now()): Promise<number> {
  const name = budgetKey(sender, nowMs);
  if (pgEnabled()) {
    const rows = await getDb().select({ value: counter.value }).from(counter).where(eq(counter.name, name));
    return rows[0]?.value ?? 0;
  }
  return (await store.get<number>(name).catch(() => null)) ?? 0;
}

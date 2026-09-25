// Send-vejens to atomiske værn (Sol-review 25/9):
// 1) én send-kørsel ad gangen — compare-and-set i Postgres, ikke KV get→put;
// 2) en SMTP-fejl gør kun kladden sendbar igen, når serveren med sikkerhed IKKE tog mailen.
import { and, eq, gt, lt, lte, sql } from "drizzle-orm";
import { getDb, pgEnabled } from "./db/client.ts";
import { counter } from "./db/schema.ts";
import { store } from "./store.ts";
import { getSenderCreds, type SenderId } from "./senders.ts";

const LOCK_NAME = "send-lock";
const KV_LOCK_KEY = "send/lock";

const kvKey = (name: string) => (name === LOCK_NAME ? KV_LOCK_KEY : `lock/${name}`);

/** Navngiven lås (CAS i counter). Returnerer et håndtag til release, eller null (optaget). */
export async function acquireLock(name: string, ttlMs: number, nowMs = Date.now()): Promise<number | null> {
  const until = Math.ceil((nowMs + ttlMs) / 1000);
  const nowSec = Math.floor(nowMs / 1000);
  if (pgEnabled()) {
    // ponytail: epoch-sekunder i counter.value (int4) holder til 2038.
    const rows = await getDb()
      .insert(counter)
      .values({ name, value: until })
      .onConflictDoUpdate({ target: counter.name, set: { value: until }, setWhere: lte(counter.value, nowSec) })
      .returning({ name: counter.name });
    return rows.length === 1 ? until : null;
  }
  const lock = await store.get<{ until: number }>(kvKey(name)).catch(() => null);
  if (lock && typeof lock.until === "number" && lock.until > nowMs) return null;
  await store.put(kvKey(name), { until: until * 1000, startedAt: new Date(nowMs).toISOString() });
  return until;
}

/** Frigiver kun egen lås (samme håndtag) — en overtaget, udløbet lås røres ikke. */
export async function releaseLock(name: string, handle: number): Promise<void> {
  if (pgEnabled()) {
    await getDb().delete(counter).where(and(eq(counter.name, name), eq(counter.value, handle)));
    return;
  }
  const lock = await store.get<{ until: number }>(kvKey(name)).catch(() => null);
  if (lock && lock.until === handle * 1000) await store.delete(kvKey(name));
}

export class LockBusyError extends Error {}

/** Kør fn under låsen `name`; venter op til waitMs på en optaget lås, ellers LockBusyError.
 *  Levetiden (120 s) er LÆNGERE end alle kalderes maxDuration (send 60 s, previews 30 s): platformen
 *  dræber ejeren før låsen kan udløbe, så en udløbet lås har ingen levende ejer (Sol R8-01). */
export const LOCK_TTL_MS = 120_000;
export async function withLock<T>(name: string, fn: () => Promise<T>, opts: { ttlMs?: number; waitMs?: number } = {}): Promise<T> {
  const { ttlMs = LOCK_TTL_MS, waitMs = 8_000 } = opts;
  const deadline = Date.now() + waitMs;
  let handle = await acquireLock(name, ttlMs);
  while (handle === null) {
    if (Date.now() > deadline) throw new LockBusyError(`optaget (${name}) — prøv igen om lidt`);
    await new Promise((res) => setTimeout(res, 150));
    handle = await acquireLock(name, ttlMs);
  }
  try {
    return await fn();
  } finally {
    await releaseLock(name, handle).catch(() => {});
  }
}

export const acquireSendLock = (ttlMs: number, nowMs = Date.now()) => acquireLock(LOCK_NAME, ttlMs, nowMs);
export const releaseSendLock = (handle: number) => releaseLock(LOCK_NAME, handle);

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
// Nøglet på den faktiske Gmail-konto: peger lucas og charlie på samme adresse, deler de budget (Sol R2 F3).
export const budgetKey = (sender: SenderId, nowMs: number) =>
  `send-day:${(getSenderCreds(sender)?.email || sender).trim().toLowerCase()}:${cphDay(nowMs)}`;

/** Tager én plads i dagens budget. false = loftet er nået (send ikke). */
export async function takeDailyBudget(sender: SenderId, nowMs = Date.now(), cap = DAILY_SEND_CAP): Promise<boolean> {
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
export async function dailyBudgetUsed(sender: SenderId, nowMs = Date.now()): Promise<number> {
  const name = budgetKey(sender, nowMs);
  if (pgEnabled()) {
    const rows = await getDb().select({ value: counter.value }).from(counter).where(eq(counter.name, name));
    return rows[0]?.value ?? 0;
  }
  return (await store.get<number>(name).catch(() => null)) ?? 0;
}

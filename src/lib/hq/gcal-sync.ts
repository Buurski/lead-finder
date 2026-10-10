// Opgaver → Google Kalender med påmindelser. En abonneret ICS-kalender giver
// ingen notifikationer i Google og synker kun hver 12.–24. time, så HQ skriver
// rigtige begivenheder i en dedikeret kalender pr. person (delt med service-
// accounten, "Foretag ændringer i begivenheder").
//
// Stateløs afstemning: ønsket tilstand (åbne opgaver + aftalers næste skridt med
// dato) sammenlignes med kalenderens HQ-mærkede begivenheder; kun forskelle
// skrives. Begivenheder uden HQ-mærket røres aldrig.
import { createHash } from "node:crypto";
import { getDb, pgEnabled } from "../db/client.ts";
import { copenhagenNow } from "../settings.ts";
import { listMyDay, type MyDayItem } from "./tasks.ts";

export type CalOwner = "lucas" | "charlie";

export interface CalEvent {
  id: string;
  summary: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  reminders: { useDefault: false; overrides: { method: "popup"; minutes: number }[] };
  transparency: "transparent";
  extendedProperties: { private: { kinlyHq: "1"; hash: string } };
}

export interface CalApi {
  /** Alle HQ-mærkede begivenheder: id → hash. */
  list(calendarId: string): Promise<Map<string, string>>;
  insert(calendarId: string, ev: CalEvent): Promise<void>;
  update(calendarId: string, ev: CalEvent): Promise<void>;
  remove(calendarId: string, id: string): Promise<void>;
}

const TZ = "Europe/Copenhagen";
const APP = process.env.APP_URL || "https://lead-finder-three-beta.vercel.app";

/** Googles event-id tillader kun [a-v0-9]; hex er en delmængde. */
export const eventIdFor = (itemId: string) => `k${createHash("sha1").update(itemId).digest("hex")}`;

/** Hvilken kalender en opgave hører til. Uden ejer → Lucas. */
export function ownerOf(item: Pick<MyDayItem, "owner">): CalOwner {
  return item.owner === "charlie" ? "charlie" : "lucas";
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_START = "09:00"; // dagens tidløse opgaver fordeles herfra
const SLOT_STEP_MIN = 15; // minutter pr. tidløs opgave
const TIMED_DURATION_MIN = 30;
const MEETING_DURATION_MIN = 60; // mødeopgaver (Book møde)

function addMinutes(time: string, add: number): string {
  const [h, m] = time.split(":").map(Number);
  const total = h * 60 + m + add;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Slutdato: ruller sluttiden over midnat, er det næste dag. */
function endDayOf(day: string, time: string, add: number): string {
  const [h, m] = time.split(":").map(Number);
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d + Math.floor((h * 60 + m + add) / 1440))).toISOString().slice(0, 10);
}

// Påmindelse dagen før kl. 17, beregnet som minutter før starttidspunktet (så den
// rammer kl. 17 uanset hvornår på dagen opgaven ligger, ikke kun ved 08:00).
// Ponytail: ignorerer DST-skiftedage (op til 1 times fejl to gange om året).
function eveningBeforeMinutes(day: string, time: string): number {
  const [y, mo, d] = day.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const start = Date.UTC(y, mo - 1, d, hh, mm);
  const eveningBefore = Date.UTC(y, mo - 1, d - 1, 17, 0);
  return Math.round((start - eveningBefore) / 60000);
}

function buildEvent(item: MyDayItem, day: string, time: string, durationMin: number, overdue: boolean): CalEvent {
  const summary = [item.important ? "❗" : "", overdue ? "(forfalden) " : "", item.title || item.context, item.company ? ` · ${item.company}` : ""].join("");
  const link = item.companyId ? `${APP}/virksomheder/${item.companyId}` : `${APP}/opgaver`;
  const description = [
    item.kind === "deal" ? `Næste skridt i aftalen: ${item.context}` : "Opgave i Kinly HQ",
    overdue ? `Oprindelig frist: ${item.due}` : "",
    item.note,
    link,
  ].filter(Boolean).join("\n");
  const base = {
    id: eventIdFor(item.id),
    summary: summary.slice(0, 250),
    description: description.slice(0, 4000),
    start: { dateTime: `${day}T${time}:00`, timeZone: TZ },
    end: { dateTime: `${endDayOf(day, time, durationMin)}T${addMinutes(time, durationMin)}:00`, timeZone: TZ },
    reminders: { useDefault: false as const, overrides: [{ method: "popup" as const, minutes: eveningBeforeMinutes(day, time) }, { method: "popup" as const, minutes: 0 }] },
    transparency: "transparent" as const,
  };
  const hash = createHash("sha1").update(JSON.stringify(base)).digest("hex").slice(0, 16);
  return { ...base, extendedProperties: { private: { kinlyHq: "1", hash } } };
}

/**
 * Opgaver → kalenderbegivenheder for én dag ad gangen. Tidsatte lægges på deres
 * eget tidspunkt (30 min, møder 60); tidløse fordeles fra kl. 09 i 15-min-slots (vigtige
 * først, så efter id), så de ikke ligger oven i hinanden. Forfaldne opgaver
 * flyttes til i dag, så de minder igen hver morgen til de er klaret.
 */
export function toEvents(items: MyDayItem[], today: string): CalEvent[] {
  const byDay = new Map<string, MyDayItem[]>();
  for (const item of items) {
    if (!DATE_RE.test(item.due)) continue;
    const day = item.due < today ? today : item.due;
    (byDay.get(day) ?? byDay.set(day, []).get(day)!).push(item);
  }
  const events: CalEvent[] = [];
  for (const [day, dayItems] of byDay) {
    for (const item of dayItems) {
      if (item.dueTime) events.push(buildEvent(item, day, item.dueTime, item.meeting ? MEETING_DURATION_MIN : TIMED_DURATION_MIN, item.due < today));
    }
    const untimed = dayItems
      .filter((i) => !i.dueTime)
      .sort((a, b) => Number(b.important) - Number(a.important) || a.id.localeCompare(b.id));
    untimed.forEach((item, idx) => {
      events.push(buildEvent(item, day, addMinutes(SLOT_START, idx * SLOT_STEP_MIN), SLOT_STEP_MIN, item.due < today));
    });
  }
  return events;
}

export interface SyncResult { owner: CalOwner; inserted: number; updated: number; removed: number; skipped?: string }

/** Afstem én persons kalender. Fejl på én begivenhed stopper ikke resten, men kastes samlet til sidst. */
export async function syncCalendar(api: CalApi, calendarId: string, owner: CalOwner, items: MyDayItem[], today: string): Promise<SyncResult> {
  const mine = items.filter((item) => ownerOf(item) === owner);
  const want = new Map(toEvents(mine, today).map((ev) => [ev.id, ev] as const));
  const have = await api.list(calendarId);
  const res: SyncResult = { owner, inserted: 0, updated: 0, removed: 0 };
  const errors: string[] = [];
  const attempt = async (what: string, fn: () => Promise<void>, count: "inserted" | "updated" | "removed") => {
    try {
      await fn();
      res[count]++;
    } catch (err) {
      errors.push(`${what}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  for (const [id, ev] of want) {
    const hash = have.get(id);
    if (hash === undefined) await attempt(`insert ${id}`, () => api.insert(calendarId, ev), "inserted");
    else if (hash !== ev.extendedProperties.private.hash) await attempt(`update ${id}`, () => api.update(calendarId, ev), "updated");
  }
  for (const id of have.keys()) {
    if (!want.has(id)) await attempt(`remove ${id}`, () => api.remove(calendarId, id), "removed");
  }
  if (errors.length) throw new Error(`${owner}: ${errors.length} fejl — ${errors.slice(0, 3).join("; ")}`);
  return res;
}

/** Rigtig Google Calendar-klient via service-accounten (samme JSON som Sheets). */
export async function googleCalApi(): Promise<CalApi> {
  const { google } = await import("googleapis");
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const auth = new google.auth.GoogleAuth({
    ...(raw ? { credentials: JSON.parse(raw) } : { keyFile: process.env.GOOGLE_KEY_FILE }),
    scopes: ["https://www.googleapis.com/auth/calendar.events"],
  });
  const cal = google.calendar({ version: "v3", auth });
  return {
    async list(calendarId) {
      const out = new Map<string, string>();
      let pageToken: string | undefined;
      do {
        const r = await cal.events.list({ calendarId, privateExtendedProperty: ["kinlyHq=1"], showDeleted: false, maxResults: 2500, pageToken });
        for (const e of r.data.items ?? []) if (e.id) out.set(e.id, e.extendedProperties?.private?.hash ?? "");
        pageToken = r.data.nextPageToken ?? undefined;
      } while (pageToken);
      return out;
    },
    async insert(calendarId, ev) {
      try {
        await cal.events.insert({ calendarId, requestBody: ev });
      } catch (err) {
        // 409 = id brugt før (fx slettet begivenhed) → genopliv med update.
        if ((err as { code?: number }).code !== 409) throw err;
        await cal.events.update({ calendarId, eventId: ev.id, requestBody: { ...ev, status: "confirmed" } });
      }
    },
    async update(calendarId, ev) {
      await cal.events.update({ calendarId, eventId: ev.id, requestBody: ev });
    },
    async remove(calendarId, id) {
      try {
        await cal.events.delete({ calendarId, eventId: id });
      } catch (err) {
        const code = (err as { code?: number }).code;
        if (code !== 404 && code !== 410) throw err; // allerede væk = fint
      }
    },
  };
}

/** Kalender-id'et for en person, eller undefined hvis ikke sat op i env. */
function calendarIdFor(owner: CalOwner): string | undefined {
  return process.env[`HQ_GCAL_${owner.toUpperCase()}`]?.trim() || undefined;
}

/** Afstemmer én persons kalender lige nu — den ene funktion cron-ruten OG
 * scheduleCalendarSync deler, så synk-logikken kun findes ét sted. */
export async function syncOwnerNow(owner: CalOwner): Promise<SyncResult> {
  if (!pgEnabled()) return { owner, inserted: 0, updated: 0, removed: 0, skipped: "DATA_BACKEND er ikke pg" };
  const calendarId = calendarIdFor(owner);
  if (!calendarId) return { owner, inserted: 0, updated: 0, removed: 0, skipped: "ikke sat op" };
  const { date } = copenhagenNow();
  const items = await listMyDay(getDb(), { owner, today: date });
  const api = await googleCalApi();
  return syncCalendar(api, calendarId, owner, items, date);
}

/**
 * Planlægger synkronisering af én persons kalender, efter svaret er sendt
 * (next/server's after() — ellers kan Vercel fryse funktionen før kaldet er
 * færdigt). Importerer next/server dynamisk: agent/tasks/route.ts må ikke
 * importere det statisk (knækker node:test uden Next's bundler, se dens egen
 * kommentar), og denne funktion kaldes derfra. Fejler ALDRIG brugerens handling
 * — en fejl her logges kun; cron-ruten er sikkerhedsnettet.
 */
export function scheduleCalendarSync(owner: CalOwner): void {
  const run = () =>
    syncOwnerNow(owner).catch((err) => {
      console.error(JSON.stringify({ evt: "calendar-sync.trigger.failed", owner, error: String(err instanceof Error ? err.message : err).slice(0, 300) }));
    });
  import("next/server")
    .then(({ after }) => after(run))
    .catch(() => { void run(); }); // next/server utilgængeligt/uden for request scope (node:test, scripts) → kør med det samme
}

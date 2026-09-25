// Opgaver → Google Kalender med påmindelser. En abonneret ICS-kalender giver
// ingen notifikationer i Google og synker kun hver 12.–24. time, så HQ skriver
// rigtige begivenheder i en dedikeret kalender pr. person (delt med service-
// accounten, "Foretag ændringer i begivenheder").
//
// Stateløs afstemning: ønsket tilstand (åbne opgaver + aftalers næste skridt med
// dato) sammenlignes med kalenderens HQ-mærkede begivenheder; kun forskelle
// skrives. Begivenheder uden HQ-mærket røres aldrig.
import { createHash } from "node:crypto";
import type { MyDayItem } from "./tasks.ts";

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

export function toEvent(item: MyDayItem, today: string): CalEvent | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.due)) return null;
  // Forfalden opgave flyttes til i dag, så den minder igen hver morgen til den er klaret.
  const day = item.due < today ? today : item.due;
  const overdue = item.due < today;
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
    start: { dateTime: `${day}T08:00:00`, timeZone: TZ },
    end: { dateTime: `${day}T08:15:00`, timeZone: TZ },
    // Kl. 17 dagen før (900 min før 08:00) og kl. 08 på dagen.
    reminders: { useDefault: false as const, overrides: [{ method: "popup" as const, minutes: 900 }, { method: "popup" as const, minutes: 0 }] },
    transparency: "transparent" as const,
  };
  const hash = createHash("sha1").update(JSON.stringify(base)).digest("hex").slice(0, 16);
  return { ...base, extendedProperties: { private: { kinlyHq: "1", hash } } };
}

export interface SyncResult { owner: CalOwner; inserted: number; updated: number; removed: number; skipped?: string }

/** Afstem én persons kalender. Fejl på én begivenhed stopper ikke resten, men kastes samlet til sidst. */
export async function syncCalendar(api: CalApi, calendarId: string, owner: CalOwner, items: MyDayItem[], today: string): Promise<SyncResult> {
  const want = new Map<string, CalEvent>();
  for (const item of items) {
    if (ownerOf(item) !== owner) continue;
    const ev = toEvent(item, today);
    if (ev) want.set(ev.id, ev);
  }
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

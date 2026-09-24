import { randomBytes, timingSafeEqual } from "node:crypto";
import { store } from "../store.ts";

export interface CalendarTask {
  id: string;
  title: string;
  due: string;
  clientName: string;
  note: string;
}

export type CalendarUser = "lucas" | "charlie";

// Tilfældigt token pr. bruger i KV — ikke afledt af sessionshemmeligheden, så et
// lækket link kan dræbes alene ("Lav nyt link" på /settings) uden at røre login.
const tokenKey = (user: CalendarUser) => `ics-token/${user}`;

export async function rotateIcsToken(user: CalendarUser): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await store.put(tokenKey(user), { token, at: new Date().toISOString() });
  return token;
}

export async function getIcsToken(user: CalendarUser): Promise<string> {
  const saved = await store.get<{ token?: string }>(tokenKey(user));
  return saved?.token ?? rotateIcsToken(user);
}

export async function icsTokenValid(user: CalendarUser, provided: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  const saved = await store.get<{ token?: string }>(tokenKey(user));
  if (!saved?.token || !/^[0-9a-f]{64}$/.test(saved.token)) return false;
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(saved.token, "hex"));
}

function escapeText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function fold(line: string): string {
  const lines: string[] = [];
  let part = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    if (bytes + size > 75) {
      lines.push(part);
      part = " ";
      bytes = 1;
    }
    part += char;
    bytes += size;
  }
  lines.push(part);
  return lines.join("\r\n");
}

export function tasksToIcs(tasks: CalendarTask[], now: Date): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kinly HQ//Opgaver//DA", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  for (const task of tasks) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(task.due)) continue;
    const summary = task.clientName ? `${task.title} · ${task.clientName}` : task.title;
    lines.push("BEGIN:VEVENT", `UID:${task.id}@kinly-hq`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${task.due.replace(/-/g, "")}`, `SUMMARY:${escapeText(summary)}`, `DESCRIPTION:${escapeText([task.note, "https://lead-finder-three-beta.vercel.app/opgaver"].filter(Boolean).join("\n"))}`, "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}

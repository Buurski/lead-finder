import { createHmac } from "node:crypto";

export interface CalendarTask {
  id: string;
  title: string;
  due: string;
  clientName: string;
  note: string;
}

export function calendarToken(user: "lucas" | "charlie", secret: string): string {
  return createHmac("sha256", secret).update(`cal:${user}`).digest("hex");
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

import { NextResponse } from "next/server";
import { readVaultNote, writeVaultNote } from "@/lib/vault";

// /api/goals — read + edit the 90-day goals that live as checkboxes in
// KnowledgeOS/wiki/os/roadmap-naeste-skridt.md.
//
// GET                              → { goals: [{ done, text }] }
// POST { action: "toggle", text }  → flip the checkbox whose text matches
// POST { action: "add", text }     → append "- [ ] text" after the last checkbox
// POST { action: "remove", text }  → delete the matching checkbox line
//
// Writes go to the LIVE vault on GitHub (Obsidian + VPS pull from there), with
// a clear commit message so the history shows who changed what.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const NOTE = "wiki/os/roadmap-naeste-skridt";
const CHECKBOX_RE = /^(\s*-\s*\[)([ xX])(\]\s+)(.*)$/;

// Split til linjer og strip trailing \r — et lokalt Windows-checkout af vaulten
// har CRLF, og `.` i CHECKBOX_RE kan ikke matche \r, så toggle/remove ramte
// "fandt ikke det mål" lokalt selvom GET viste målet (Bundle G-fund).
// Writes joiner med \n, så noten normaliseres til LF ved første redigering.
function toLines(md: string): string[] {
  return md.split("\n").map((l) => l.replace(/\r$/, ""));
}

function parseGoals(md: string): { done: boolean; text: string }[] {
  const out: { done: boolean; text: string }[] = [];
  for (const line of toLines(md)) {
    const m = line.match(CHECKBOX_RE);
    if (m) out.push({ done: m[2].toLowerCase() === "x", text: m[4].trim() });
  }
  return out;
}

export async function GET() {
  const note = await readVaultNote(NOTE, { preferRemote: true });
  if (!note.ok) return NextResponse.json({ ok: false, error: note.reason }, { status: 502 });
  return NextResponse.json({ ok: true, goals: parseGoals(note.body) });
}

export async function POST(req: Request) {
  let body: { action?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "ugyldig JSON" }, { status: 400 });
  }
  const action = (body.action ?? "").trim();
  const text = (body.text ?? "").trim();
  if (!["toggle", "add", "remove"].includes(action)) {
    return NextResponse.json({ ok: false, error: "action skal være toggle|add|remove" }, { status: 400 });
  }
  if (!text || text.length > 300) {
    return NextResponse.json({ ok: false, error: "text mangler eller er for lang" }, { status: 400 });
  }

  // always edit the freshest version of the note
  const note = await readVaultNote(NOTE, { preferRemote: true });
  if (!note.ok) return NextResponse.json({ ok: false, error: note.reason }, { status: 502 });

  const lines = toLines(note.raw);
  let changed = false;
  let commitVerb = "";

  if (action === "add") {
    const exists = lines.some((l) => {
      const m = l.match(CHECKBOX_RE);
      return m && m[4].trim().toLowerCase() === text.toLowerCase();
    });
    if (exists) return NextResponse.json({ ok: false, error: "målet findes allerede" }, { status: 409 });
    let lastIdx = -1;
    lines.forEach((l, i) => {
      if (CHECKBOX_RE.test(l)) lastIdx = i;
    });
    const newLine = `- [ ] ${text}`;
    if (lastIdx >= 0) lines.splice(lastIdx + 1, 0, newLine);
    else lines.push("", newLine);
    changed = true;
    commitVerb = "tilføj mål";
  } else {
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(CHECKBOX_RE);
      if (!m || m[4].trim().toLowerCase() !== text.toLowerCase()) continue;
      if (action === "toggle") {
        const flipped = m[2].toLowerCase() === "x" ? " " : "x";
        lines[i] = `${m[1]}${flipped}${m[3]}${m[4]}`;
        commitVerb = flipped === "x" ? "marker mål som klaret" : "genåbn mål";
      } else {
        lines.splice(i, 1);
        commitVerb = "fjern mål";
      }
      changed = true;
      break;
    }
    if (!changed) return NextResponse.json({ ok: false, error: "fandt ikke det mål i noten" }, { status: 404 });
  }

  const result = await writeVaultNote(
    NOTE,
    lines.join("\n"),
    `goals: ${commitVerb} — "${text.slice(0, 60)}" (via Command Center)`,
  );
  if (!result.ok) return NextResponse.json({ ok: false, error: result.reason }, { status: 502 });
  return NextResponse.json({ ok: true, goals: parseGoals(lines.join("\n")) });
}

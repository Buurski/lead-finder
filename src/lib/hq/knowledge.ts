// "Opdatér vidensbase" (spec §10): AI foreslår en opdateret kundenote ud fra CRM-data
// + den eksisterende note. Mennesket ser forskellen, kan rette, og gemmer selv i vaulten.
// Intet skrives uden et klik; forslaget må kun bruge fakta fra de to kilder.

export const KB_ROOT = "wiki/kunder/";
const MAX_NOTE = 60_000;

export class KnowledgeError extends Error {}

function fold(s: string): string {
  return s.toLowerCase().replace(/æ/g, "ae").replace(/ø/g, "oe").replace(/å/g, "aa").normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Sti til en ny kundenote, fx "wiki/kunder/kt-vvs.md". */
export function kbPathFor(companyName: string): string {
  const slug = fold(companyName).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "kunde";
  return `${KB_ROOT}${slug}.md`;
}

/** Kun noter direkte i wiki/kunder — aldrig andre steder i vaulten. */
export function validKbPath(p: unknown): p is string {
  return typeof p === "string" && p.startsWith(KB_ROOT) && /^wiki\/kunder\/[a-z0-9._-]+\.md$/i.test(p) && !p.includes("..");
}

export function validNoteContent(c: unknown): c is string {
  return typeof c === "string" && c.trim().length > 20 && c.length <= MAX_NOTE;
}

export function knowledgePrompt(opts: { companyName: string; crm: string; current: string | null; today: string }): { system: string; prompt: string } {
  const system = [
    "Du vedligeholder Kinlys interne kundenoter (Obsidian-markdown, dansk).",
    "Regler: Brug KUN fakta fra CRM-data og den eksisterende note — opfind intet.",
    "Bevar eksisterende frontmatter, overskrifter og vigtige detaljer; ret kun det CRM-data viser er ændret.",
    "Tilføj nye fakta med dato (YYYY-MM-DD). Markér forældede oplysninger i stedet for at slette dem, hvis de kan have historisk værdi.",
    "Hold det kort og konkret: aftale/pris, leverancer, kontakt, status, åbne punkter, seneste kontakt.",
    "Svar KUN med den fulde, opdaterede note — ingen forklaring før eller efter.",
  ].join("\n");
  const prompt = [
    `Kunde: ${opts.companyName} · I dag: ${opts.today}`,
    "",
    "## Eksisterende note",
    opts.current?.trim() || `(ingen note endnu — lav en ny med frontmatter: title: ${opts.companyName}, type: kunde)`,
    "",
    "## CRM-data (sandheden for tal, datoer og status)",
    opts.crm,
  ].join("\n");
  return { system, prompt };
}

/** Fjerner en evt. ```markdown-indpakning fra modellens svar. */
export function cleanModelNote(text: string): string {
  const t = text.trim();
  const m = t.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/);
  return (m ? m[1] : t).trim() + "\n";
}

export type DiffLine = { t: " " | "+" | "-"; line: string };

/** Linje-diff (LCS). ponytail: O(n·m) — fint til kundenoter (< ~600 linjer). */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");
  const n = a.length;
  const m = b.length;
  const L: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push({ t: " ", line: a[i] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: "-", line: a[i++] });
    else out.push({ t: "+", line: b[j++] });
  }
  while (i < n) out.push({ t: "-", line: a[i++] });
  while (j < m) out.push({ t: "+", line: b[j++] });
  return out;
}

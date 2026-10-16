// annonce-tekster-ai.ts — "Skriv tekster" i Annonce-studiet. Forslag fra modellen (task "qualify" = Sonnet via lib/ai.ts)
// gemmes ALDRIG direkte: hvert forslag køres gennem samme regler som manuelle tekster (tekstFejl), og Lucas vælger og
// gemmer selv. Input er kun HQ's egne data (koncept, billedtekst, fakta-listen) + Lucas' egen vinkel, aldrig skrabet tekst.
import "server-only";
import { generate } from "../ai.ts";
import { HEADLINE_MAX, PRIMARY_MAX, type Annonce } from "./annoncer-types.ts";
import { AD_FAKTA, tekstFejl } from "./annonce-studie-types.ts";

export class AiUtilgaengelig extends Error {}

export interface Forslag { overskrifter: string[]; primaere: string[]; fakta_id: string[]; afvist: Array<{ tekst: string; fejl: string[] }> }

const SYSTEM = `Du skriver Meta-annoncetekster på dansk for Kinly: Lucas og Charlie, to i Herning, der koder hjemmesider til små danske virksomheder.
Stemme: ærlig, varm, jordnær. Skriv til kunden i "I"-form, om os i "vi"-form. Ingen fagord (ikke "SEO", ikke "kodet" alene uden "fra bunden"), ingen superlativer, ingen garantier, ingen tankestreger, ingen udråbstegn.
Brug KUN fakta fra listen. Opfind aldrig tal, tider, kunder eller resultater. Hver pris skal stå med "ekskl. moms".
Svar KUN med JSON: {"overskrifter": [...], "primaere": [...], "fakta_id": [...]}.`;

export function bygPrompt(a: Pick<Annonce, "koncept" | "still_tekst" | "overskrift" | "primaer_tekst">, vinkel: string): string {
  return [
    `Annoncens koncept: ${a.koncept}`,
    `Tekst i billedet (gentag den ikke ordret): ${a.still_tekst}`,
    `Nuværende overskrift: ${a.overskrift}`,
    `Nuværende primærtekst: ${a.primaer_tekst}`,
    vinkel ? `Lucas' ønskede vinkel: ${vinkel}` : "",
    "",
    "Fakta du må bruge (id: tekst):",
    ...AD_FAKTA.map((f) => `- ${f.id}: ${f.tekst}`),
    "",
    `Skriv 3 overskrifter (højst ${HEADLINE_MAX} tegn) og 3 primærtekster (højst ${PRIMARY_MAX} tegn).`,
    "Hver overskrift og hver primærtekst skal have sin egen vinkel: 1) pris, 2) I ejer siden, 3) se et gratis udkast før I betaler.",
    "fakta_id = de id'er du har brugt.",
  ].filter((l) => l !== "").join("\n");
}

/** Tolker modellens svar. Ugyldige forslag lægges i `afvist` med grunden, så Lucas kan se, hvad der blev sorteret fra. */
export function tolkSvar(raw: string): Forslag {
  const m = raw.match(/\{[\s\S]*\}/);
  let j: Record<string, unknown> = {};
  try {
    j = m ? (JSON.parse(m[0]) as Record<string, unknown>) : {};
  } catch {
    j = {};
  }
  const afvist: Forslag["afvist"] = [];
  const sorter = (v: unknown, max: number) =>
    (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string").map((t) => t.trim().replace(/\s+/g, " ")).filter((t) => {
      const f = tekstFejl(t, max);
      if (f.length) afvist.push({ tekst: t, fejl: f });
      return f.length === 0;
    }).slice(0, 5);
  const ids = new Set(AD_FAKTA.map((f) => f.id));
  return {
    overskrifter: sorter(j.overskrifter, HEADLINE_MAX),
    primaere: sorter(j.primaere, PRIMARY_MAX),
    fakta_id: (Array.isArray(j.fakta_id) ? j.fakta_id : []).filter((x): x is string => typeof x === "string" && ids.has(x)),
    afvist,
  };
}

export async function foreslaaTekster(a: Annonce, vinkel: string): Promise<Forslag> {
  const res = await generate({ task: "qualify", system: SYSTEM, prompt: bygPrompt(a, vinkel), maxTokens: 900, temperature: 0.7, timeoutMs: 25_000 });
  // null = ingen nøgle, AI slået fra, dagsloftet nået eller fejl. Sig det tydeligt; Lucas kan skrive teksterne selv.
  if (!res) throw new AiUtilgaengelig("AI er ikke tilgængelig lige nu (ingen nøgle, dagsloft nået eller fejl). Skriv teksterne selv nedenfor.");
  return tolkSvar(res.text);
}

// SEO-"Opdateringer": ny GSC-måling mod forrige → konkrete ændringer (regel) →
// Jev dømmer om vi skal handle / om det er værd at fortælle kunden (rådgiver).
// Kræver handling ⇒ opgave. Alt gemmes som aktivitet "seo-opdatering" på kunden.
// Strip-safe (node --test).
import type { Db } from "../db/client.ts";
import { activity, task } from "../db/schema.ts";
import { jevAsk, noul } from "../jev.ts";

type Snap = {
  clicks: number;
  impressions: number;
  position: number | null;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
};
/** `kunde` = samme ændring i kundens sprog (kun gode ændringer). Månedsrapportens "Det er nyt"
 *  bruger den, når Jev har sagt at nyheden er værd at fortælle. Koden skriver tallene, Jev vælger. */
export interface GscChange { kind: "klik" | "visninger" | "placering" | "ny-søgning" | "tabt-søgning"; text: string; good: boolean; kunde?: { titel: string; tekst: string } }

const pct = (now: number, before: number) => Math.round(((now - before) / before) * 100);
const komma = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** Kun ændringer der er store nok til at betyde noget (støj filtreres fra). */
export function diffGsc(prev: Snap, now: Snap): GscChange[] {
  const out: GscChange[] = [];
  for (const [kind, a, b, min] of [["klik", prev.clicks, now.clicks, 10], ["visninger", prev.impressions, now.impressions, 100]] as const) {
    if (a > 0 && Math.abs(b - a) >= min && Math.abs(pct(b, a)) >= 20) {
      const [fa, fb] = [a.toLocaleString("da-DK"), b.toLocaleString("da-DK")];
      const kunde =
        b <= a ? undefined
        : kind === "klik" ? { titel: "Flere besøg fra Google", tekst: `${fb} besøg fra Google de seneste fire uger mod ${fa} sidst. Det er ${pct(b, a)} % flere.` }
        : { titel: "I bliver set oftere", tekst: `Jeres side blev vist ${fb} gange i Google mod ${fa} sidst.` };
      out.push({ kind, text: `${kind === "klik" ? "Klik" : "Visninger"} ${b > a ? "steg" : "faldt"} ${Math.abs(pct(b, a))} % (${fa} → ${fb})`, good: b > a, ...(kunde ? { kunde } : {}) });
    }
  }
  if (prev.position != null && now.position != null && Math.abs(now.position - prev.position) >= 0.5) {
    const better = now.position < prev.position;
    const kunde = better ? { titel: "I står højere i Google", tekst: `I snit står I nu som nr. ${komma(now.position)}. Da vi målte sidst, var det nr. ${komma(prev.position)}. Nr. 1 er øverst.` } : undefined;
    out.push({ kind: "placering", text: `Gns. placering ${better ? "forbedret" : "forværret"} fra ${komma(prev.position)} til ${komma(now.position)}`, good: better, ...(kunde ? { kunde } : {}) });
  }
  const before = new Set(prev.topQueries.map((q) => q.query));
  const after = new Set(now.topQueries.map((q) => q.query));
  const added = now.topQueries.filter((q) => !before.has(q.query) && q.clicks > 0).slice(0, 3);
  const lost = prev.topQueries.filter((q) => !after.has(q.query) && q.clicks >= 3).slice(0, 3);
  if (added.length) {
    const liste = added.map((q) => `"${q.query}"`).join(", ");
    out.push({ kind: "ny-søgning", text: `Ny i top-søgninger: ${liste}`, good: true, kunde: { titel: "Nye søgninger finder jer", tekst: `Folk finder jer nu også, når de søger på ${liste}.` } });
  }
  if (lost.length) out.push({ kind: "tabt-søgning", text: `Røget ud af top-søgninger: ${lost.map((q) => `"${q.query}"`).join(", ")}`, good: false });
  return out;
}

export interface Verdict { handling: boolean; kunde: boolean; jev: boolean }
export type Judge = (name: string, changes: GscChange[]) => Promise<Verdict>;

/** Jev som rådgiver; uden Jev: handling ved ethvert fald, kunde-nyhed ved kun fremgang. */
export const jevJudge: Judge = async (name, changes) => {
  const fallback = { handling: changes.some((c) => !c.good), kunde: changes.every((c) => c.good), jev: false };
  const r = await jevAsk(
    { kunde: name, kilde: "Google Search Console, 28 dage mod forrige måling", ændringer: changes.map((c) => c.text) },
    {
      handling: { type: "noul", instructions: "Vi er kundens webbureau. Kræver disse ændringer at vi snart undersøger eller retter noget på kundens hjemmeside?" },
      kunde: { type: "noul", instructions: "Er ændringerne en god nyhed, der er værd at fortælle kunden i en kort opdatering?" },
    },
    { timeoutMs: 8000 },
  );
  const h = noul(r?.answers, "handling");
  const k = noul(r?.answers, "kunde");
  if (h === undefined || k === undefined) return fallback;
  return { handling: h >= 0.6, kunde: k >= 0.6, jev: true };
};

/** Gem opdateringen (og en opgave hvis der skal handles). Ingen ændringer ⇒ intet gemmes. */
export async function recordGscUpdate(
  db: Db,
  c: { id: string; name: string },
  prev: Snap,
  now: Snap,
  today: string,
  judge: Judge = jevJudge,
): Promise<{ changes: GscChange[]; verdict: Verdict } | null> {
  const changes = diffGsc(prev, now);
  if (!changes.length) return null;
  const verdict = await judge(c.name, changes);
  await db.insert(activity).values({
    companyId: c.id,
    type: "seo-opdatering",
    actor: "system",
    summary: changes.slice(0, 2).map((x) => x.text).join(" · "),
    payload: { changes, ...verdict },
  });
  if (verdict.handling) {
    const worst = changes.find((x) => !x.good) ?? changes[0];
    await db.insert(task).values({ companyId: c.id, clientName: c.name, owner: "lucas", title: `SEO: ${c.name} — ${worst.text}`, due: today });
  }
  return { changes, verdict };
}

// tone-mixer.ts — extreme, human variation for cold-mail openers, built from
// OUTREACH_ANALYSIS_2026-06-04 (Lucas's real 80+ mails). Deterministic per lead
// (same lead -> same mix, re-runnable), data-aware (only uses an opener whose
// data actually exists), and strip-safe so the node engine + tests import it.
//
// Hard lessons baked in:
//   - DROP "ser ud til at have bygget noget særligt op" — 30+ sends, 0 positives.
//   - Proven openers: tillykke+anerkendelse, konkret teknisk problem, konkret
//     detalje + autoritets-tal, demo-krog, brand-tolkning.
//   - Keep the salgselev-hobby disclosure — it is THE differentiator.
//   - Follow-up at 7 days, not 12.
//   - Hostile blacklist never gets mailed again.
//   - Avoid stat-citation overuse (94%/88%/75%) — use the lead's own real number.

export const FOLLOWUP_DAYS = 7;
export const FOLLOWUP_LONGTAIL_DAYS = 14;

// Permanent: explicit "never again" responders + misfires from the analysis.
export const HOSTILE_BLACKLIST = ["thellufsenfoto", "caroline bjerring"];

export function isBlacklisted(name: string): boolean {
  const n = (name || "").toLowerCase().replace(/[^a-zæøå0-9]/g, "");
  return HOSTILE_BLACKLIST.some((b) => n.includes(b.replace(/[^a-zæøå0-9]/g, "")));
}

export interface MixLead {
  name: string;
  branch?: string;
  city?: string;
  reviewsCount?: number;
  websiteStatus?: string; // "none" | "dead" | "old" | "ok"
  hooks?: string[];
  achievements?: string[]; // awards/titles for the "Tillykke" opener (Block 3)
}

export type OpenerKind = "achievement" | "lokation" | "quote" | "tech-problem" | "review-volume" | "detail" | "demo-hook" | "brand";

export interface ToneMix {
  comboId: string;
  openerKind: OpenerKind;
  opener: string;
  disclosure: string;
  demoIntro: string;
  closing: string;
}

// Stable string hash -> deterministic, re-runnable choice per lead.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}
function pick<T>(seed: string, variants: T[]): T {
  return variants[hash(seed) % variants.length];
}

// Pull a clean, sentence-bounded quote from `en kunde fremhæver: "…"`.
function cleanQuote(hook: string): string | null {
  const m = hook.match(/"([^"]+)"/);
  if (!m) return null;
  let q = m[1].replace(/[\s.…]+$/u, "").trim();
  const dot = q.lastIndexOf(".");
  if (dot > 25) q = q.slice(0, dot).trim();
  else {
    const comma = q.lastIndexOf(",");
    if (comma > 25) q = q.slice(0, comma).trim();
  }
  q = q.replace(/[\s,]+(og|men|som|der|at|en|et|med|på|til|af|for|er|var|[a-zæøå]{1,2}|\d+)$/i, "").trim();
  q = q.replace(/[\s,]+$/u, "").trim();
  if (q.length < 12) return null;
  return q.charAt(0).toLowerCase() + q.slice(1);
}

function cleanHook(hook: string): string {
  let h = hook.trim();
  h = h.replace(/^(nævner|etableret|summary[:\s]*)/i, "").trim();
  if (/^\d{4}$/.test(h)) return `historie helt tilbage til ${h}`;
  return h;
}

interface OpenerCandidate {
  kind: OpenerKind;
  text: string;
}

// Build the list of openers whose data is actually present, in priority order.
// The final choice is a deterministic pick among them so a batch never repeats.
function eligibleOpeners(lead: MixLead): OpenerCandidate[] {
  const out: OpenerCandidate[] = [];
  const city = lead.city || "byen";
  const seed = lead.name;
  const hook = (lead.hooks || []).find((h) => h && h.length > 4);

  // 0. Achievement — the strongest opener in the analysis (RR Studio replied in
  //    17h to a "Tillykke + ærlig talt netop derfor"). Highest priority.
  const achievement = (lead.achievements || []).find((a) => a && a.length >= 4);
  if (achievement) {
    out.push({
      kind: "achievement",
      text: pick(seed + "ach", [
        `først og fremmest: ${achievement} er altså ret stort. Tillykke. Men det er også ærlig talt netop derfor jeg skriver, for når man er på det niveau fagligt, så er hjemmesiden tit det første sted nye kunder møder en.`,
        `tillykke med ${achievement}. Det er ærlig talt netop derfor jeg skriver. Når man har leveret på det niveau, fortjener hjemmesiden samme finish.`,
      ]),
    });
  }

  // 0b. Lokation + branche — high-priority fallback for leads WITHOUT
  //     review/achievement data but WITH branch+city. Reads as personal
  //     (\"For en permanent makeup i Faaborg…\") instead of generic
  //     (\"Med jeres kundebase…\").
  if (lead.branch && lead.city && (lead.branch + " " + lead.city).trim().length > 4) {
    out.push({
      kind: "lokation",
      text: pick(seed + "l", [
        `For en ${lead.branch} i ${lead.city} er det faktisk overraskende få der har en hjemmeside der matcher det de laver. Det er ærlig talt derfor jeg skriver.`,
        `Det jeg lagde mærke til med jer i ${lead.city}: en ${lead.branch} på det niveau, fortjener en hjemmeside der gør det samme.`,
        `En ${lead.branch} i ${lead.city} som jer er præcis den type jeg gerne vil bygge noget til. Det er derfor jeg skriver.`,
      ]),
    });
  }

  // 1. Review-quote — strongest, most human (real customer words).
  const quoteHook = (lead.hooks || []).find((h) => /^en kunde fremhæver/i.test(h));
  if (quoteHook) {
    const q = cleanQuote(quoteHook);
    if (q) {
      out.push({
        kind: "quote",
        text: pick(seed + "q", [
        `jeg faldt over en af jeres anmeldelser, hvor en kunde skrev "${q}". Sådan noget kan man ikke købe sig til.`,
        `en af jeres anmeldelser fangede mig: en kunde skrev "${q}".`,
      ]),
      });
    }
  }

  // 2. Konkret teknisk problem — reads as advice, not sales (VIDA-tråden).
  const ws = (lead.websiteStatus || "").toLowerCase();
  if (ws === "none" || ws === "dead") {
    out.push({
      kind: "tech-problem",
      text: pick(seed + "t", [
        `jeg ledte efter jer online og kunne faktisk ikke finde en rigtig hjemmeside, kun en Facebook-side. Det betyder at dem der googler jer i ${city}, ofte lander et tilfældigt sted.`,
        `det jeg lagde mærke til er, at I ikke rigtig har en hjemmeside endnu, så når nogen googler jer, er der ikke noget at lande på.`,
      ]),
    });
  } else if (ws === "old") {
    out.push({
      kind: "tech-problem",
      text: pick(seed + "t", [
        `jeg kiggede på jeres side, og den virker til at være et par år gammel. Det er nok ikke helt det første indtryk I selv ville vælge i dag.`,
        `jeres side fungerer, men den bærer lidt præg af at have nogle år på bagen, og det er tit dér nye kunder danner deres første indtryk.`,
      ]),
    });
  }

  // 3. Konkret detalje + autoritets-tal — the lead's OWN real number.
  if ((lead.reviewsCount ?? 0) >= 40) {
    out.push({
      kind: "review-volume",
      text: pick(seed + "r", [
        `jeg sad og kiggede på jer i ${city}, og ${lead.reviewsCount} anmeldelser. Det er folk der kommer tilbage.`,
        `${lead.reviewsCount} anmeldelser for en ${lead.branch || "virksomhed"} af jeres størrelse er ærlig talt flot. Det siger noget om jer.`,
      ]),
    });
  }

  // 4. Specific named detail (service / award / established-since).
  if (hook && !/^en kunde fremhæver/i.test(hook) && !/anmeldelser/i.test(hook)) {
    out.push({
      kind: "detail",
      text: pick(seed + "d", [
        `jeg lagde mærke til jeres ${cleanHook(hook)}. Det ser virkelig stærkt ud.`,
        `jeres ${cleanHook(hook)} fangede mig, og jeg blev nysgerrig.`,
      ]),
    });
  }

  // 5. Anerkendelse + demo-krog — altid tilgængelig, anerkender kundens arbejde
  //    FØRST og linker til demo bagefter. Varierer kraftigt så det ikke lyder
  //    som om alle mails er skåret over samme skabelon.
  out.push({
    kind: "demo-hook",
    text: pick(seed + "h", [
      `Med det ry og de anmeldelser I har bygget op, fortjener I et website der matcher niveauet. Et der henter nye kunder ind, frem for bare at vise de nuværende vej.`,
      `Det I har bygget op er tydeligvis noget særligt, og det fortjener en side der viser det ordentligt frem til nye kunder der ikke kender jer endnu.`,
      `Jeg lagde mærke til jeres arbejde, og tænkte at det kunne være fedt at give jer en hjemmeside der gør det samme som I gør: leverer kvalitet fra første klik.`,
      `Med jeres kundebase giver det god mening med en side der gør et stærkere første indtryk, så nye kunder ikke bare forsvinder igen.`,
      `Det man møder hos jer online bør matche den kvalitet I leverer IRL. Det er faktisk det der har fået mig til at skrive.`,
    ]),
  });

  // 5b. Lokation + branche — fallback for leads WITHOUT reviews/achievements/
  //     hooks/websiteStatus. Use the lead's own branch + city instead of
  //     generic "kundebase". Avoids the "Med jeres kundebase…" being used
  //     twice (opener + value-line) when nothing else is available.
  if (lead.branch && lead.city && (lead.branch + " " + lead.city).trim().length > 4) {
    out.push({
      kind: "brand", // reuses brand opener kind for now
      text: pick(seed + "l", [
        `For en ${lead.branch} i ${lead.city} er det faktisk overraskende få der har en hjemmeside der matcher det de laver. Det er ærlig talt derfor jeg skriver.`,
        `Det jeg lagde mærke til med jer i ${lead.city}: en ${lead.branch} på det niveau, fortjener en hjemmeside der gør det samme.`,
        `En ${lead.branch} i ${lead.city} som jer er præcis den type jeg gerne vil bygge noget til. Det er derfor jeg skriver.`,
      ]),
    });
  }

  // 6. Brand-tolkning — neutral, safe across every branch (no "projekter"/"menu").
  out.push({
    kind: "brand",
    text: pick(seed + "b", [
      `jeg gik efter et stilrent og roligt look, fordi jeg synes I har en brandværdi der peger den vej.`,
      `jeg blev nysgerrig på jer i ${city} og kom til at tænke på, hvordan en rolig, stilren side kunne klæde jer.`,
    ]),
  });

  return out;
}

export function mixForLead(lead: MixLead): ToneMix {
  const seed = lead.name;
  const openers = eligibleOpeners(lead);
  // Priority: achievement > lokation (branch+city) > others. Achievement
  // is the analysis's #1 opener. Lokation is preferred over demo-hook for
  // hooks-less leads (reads as personal). Demo-hook is the universal fallback.
  const ach = openers.find((o) => o.kind === "achievement");
  const lok = openers.find((o) => o.kind === "lokation");
  // Specifikke openers (kundens egne tal/citater/site-problemer) slår lokation —
  // lokation slår kun de generiske fallbacks (demo-hook/brand). Tidligere blev
  // lokation valgt over ALT undtagen achievement, hvilket både druknede
  // review-volume/quote/tech-problem og gav næsten ens mails i en batch.
  const specific = openers.filter((o) => o.kind === "quote" || o.kind === "tech-problem" || o.kind === "review-volume" || o.kind === "detail");
  let chosen;
  if (ach) {
    chosen = ach;
  } else if (specific.length > 0) {
    chosen = specific[hash(seed + "open") % specific.length];
  } else if (lok) {
    chosen = lok;
  } else {
    chosen = openers[hash(seed + "open") % openers.length];
  }

  // The salgselev-hobby disclosure — the differentiator. Always present.
  // The salgselev-hobby disclosure (the differentiator). No "pris"/"gratis" — the
  // voice-guide bans money words in cold mail, so we keep the humble, fair tone
  // without the literal word.
  const disclosure = pick(seed + "i", [
    `Jeg laver hjemmesider som hobby ved siden af min salgselev-plads, så det er helt uden det store setup. Bare mig, ærligt og ligetil.`,
    `Det er mig der sidder og bygger dem, ved siden af min salgselev-plads. Ingen bureau-pakke, bare en ærlig snak.`,
    `Jeg bygger sider som hobby ved siden af mit arbejde som salgselev, så det er afslappet og ligetil.`,
  ]);

  const demoIntro = pick(seed + "dm", [
    `Jeg lavede et par demoer I kan kigge på:`,
    `Sådan kunne det fx se ud, kig endelig:`,
    `Bedst hvis I selv kigger:`,
  ]);

  const closing = pick(seed + "c", [
    `Sig endelig til, hvis I vil se en version til jer. Ellers ingen skade sket.`,
    `Bare en idé. Skriv gerne hvis det lyder interessant.`,
    `Helt uden forventning. Skriv hvis I har lyst, ellers intet problem.`,
    `Skriv endelig hvis det kunne være noget, og hvis ikke, så ingen skade sket.`,
  ]);

  return {
    comboId: `${chosen.kind}/${hash(seed + "open") % 4}`,
    openerKind: chosen.kind,
    opener: chosen.text,
    disclosure,
    demoIntro,
    closing,
  };
}

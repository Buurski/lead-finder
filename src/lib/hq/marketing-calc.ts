// marketing-calc.ts — ren regning til /marketing (ingen db, ingen server-only, så
// klienten må importere den). To ting: A/B-dommen og tragten.

import type { MeasureDto, RefDto } from "./marketing-types.ts";

// ---------------------------------------------------------------- A/B-dom

export type AbVerdict = "for-tidligt" | "ingen-afgoerelse" | "signal" | "skaer";
export interface AbCall {
  verdict: AbVerdict;
  /** Armen med højest median (null ved lighed eller når der ikke kan siges noget). */
  ahead: "A" | "B" | null;
  nA: number;
  nB: number;
  medA: number | null;
  medB: number | null;
  /** Kort dansk tekst til skærmen. */
  text: string;
}

export const AB_MIN = 3; // under det: for tidligt
export const AB_CUT_MIN = 5; // fra og med det må en arm skæres
export const AB_CUT_GAP = 0.25; // arm ≥ 25 % dårligere end den anden

export const AB_LABEL: Record<AbVerdict, string> = {
  "for-tidligt": "For tidligt",
  "ingen-afgoerelse": "Ingen afgørelse",
  signal: "Signal",
  skaer: "Skær",
};

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Dommen over to arme. `a` og `b` er ét tal pr. opslag (fx gem + delinger pr. 1000
 * visninger); opslag uden tal skal være sorteret fra FØR kaldet.
 * Rækkefølge (første træffer gælder):
 *  1. færre end 3 opslag i en af armene            → for tidligt
 *  2. begge medianer er 0                          → ingen afgørelse
 *  3. mindst 5 opslag i begge og den dårligste arms median er ≥ 25 % under den bedste → skær
 *  4. ellers (mindst 3 i begge)                    → signal (retning, ikke bevis)
 */
export function abVerdict(a: number[], b: number[]): AbCall {
  const nA = a.length;
  const nB = b.length;
  const medA = median(a);
  const medB = median(b);
  const base = { nA, nB, medA, medB };
  if (Math.min(nA, nB) < AB_MIN) {
    const need = AB_MIN - Math.min(nA, nB);
    return { ...base, verdict: "for-tidligt", ahead: null, text: `For tidligt: der skal mindst ${AB_MIN} opslag på hver side. Mangler ${need} mere.` };
  }
  const mA = medA ?? 0;
  const mB = medB ?? 0;
  if (mA === 0 && mB === 0) {
    return { ...base, verdict: "ingen-afgoerelse", ahead: null, text: "Ingen afgørelse: begge sider ligger på 0." };
  }
  const ahead = mA === mB ? null : mA > mB ? "A" : "B";
  if (ahead && Math.min(nA, nB) >= AB_CUT_MIN) {
    const best = Math.max(mA, mB);
    const worst = Math.min(mA, mB);
    if ((best - worst) / best >= AB_CUT_GAP - 1e-9) {
      const loser = ahead === "A" ? "B" : "A";
      return { ...base, verdict: "skaer", ahead, text: `Skær: ${loser} er mindst 25 % dårligere end ${ahead} efter ${Math.min(nA, nB)}+ opslag. Drop ${loser}.` };
    }
  }
  return {
    ...base,
    verdict: "signal",
    ahead,
    text: ahead ? `Signal: ${ahead} ligger foran. Det er en retning, ikke et bevis.` : "Signal: siderne ligger lige. Fortsæt, til der er mindst 5 opslag på hver.",
  };
}

// ---------------------------------------------------------------- tal pr. opslag

export interface MeasureNums {
  views: number | null;
  saves: number | null;
  shares: number | null;
  newFollowers?: number | null;
  profileVisits: number | null;
  linkClicks?: number | null;
  inquiries: number | null;
}

/** Gem + delinger pr. 1000 visninger. null når visninger mangler/0 — så tæller opslaget ikke med. */
export function savesSharesPer1000(m: Pick<MeasureNums, "views" | "saves" | "shares">): number | null {
  if (!m.views || m.views <= 0) return null;
  if (m.saves == null && m.shares == null) return null;
  return Math.round((((m.saves ?? 0) + (m.shares ?? 0)) / m.views) * 10_000) / 10;
}

// ---------------------------------------------------------------- tragten

export interface FunnelStep {
  key: "reach" | "keep" | "profile" | "inquiry";
  label: string;
  /** null = ingen opslag har målt det trin. */
  value: number | null;
  /** Andel af forrige trin i procent (null hvis ét af trinnene mangler eller forrige er 0). */
  ofPrev: number | null;
}
export interface Funnel {
  posts: number;
  steps: FunnelStep[];
}

const sum = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

/** Rækkevidde → gem/delinger → profilbesøg → henvendelser. Kun manuelle tal; manglende = null, aldrig 0. */
export function funnel(rows: MeasureNums[]): Funnel {
  const reach = sum(rows.map((r) => r.views));
  const keepParts = rows.map((r) => (r.saves == null && r.shares == null ? null : (r.saves ?? 0) + (r.shares ?? 0)));
  const keep = sum(keepParts);
  const profile = sum(rows.map((r) => r.profileVisits));
  const inquiry = sum(rows.map((r) => r.inquiries));
  const vals: Array<[FunnelStep["key"], string, number | null]> = [
    ["reach", "Rækkevidde", reach],
    ["keep", "Gemt og delt", keep],
    ["profile", "Profilbesøg", profile],
    ["inquiry", "Henvendelser", inquiry],
  ];
  const steps = vals.map(([key, label, value], i): FunnelStep => {
    const prev = i > 0 ? vals[i - 1][2] : null;
    const ofPrev = value != null && prev != null && prev > 0 ? Math.round((value / prev) * 1000) / 10 : null;
    return { key, label, value, ofPrev };
  });
  return { posts: rows.length, steps };
}

// ---------------------------------------------------------------- datoer (kalenderen)

/** Dagens dato i Danmark som ÅÅÅÅ-MM-DD (sv-SE giver ISO-formen). */
export const todayCph = (now = new Date()): string => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Copenhagen" }).format(now);

/** Mandagen i ugen for en ÅÅÅÅ-MM-DD-dato. */
export function mondayOf(day: string): string {
  const d = new Date(day + "T00:00:00Z");
  const back = (d.getUTCDay() + 6) % 7; // man=0 … søn=6
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

/** `weeks` uger á 7 dage fra mandagen i ugen for `from`. */
export function weekGrid(from: string, weeks: number): string[][] {
  const start = new Date(mondayOf(from) + "T00:00:00Z");
  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const x = new Date(start);
      x.setUTCDate(start.getUTCDate() + w * 7 + d);
      return x.toISOString().slice(0, 10);
    }),
  );
}

// ---------------------------------------------------------------- dom pr. test

export interface AbBoardItem {
  test: RefDto;
  call: AbCall;
  /** Tal pr. opslag pr. arm (gem + delinger pr. 1000), til visning. */
  values: { A: number[]; B: number[] };
}

/** Dommen pr. test: opslag uden visninger tæller ikke med (kan ikke regnes pr. 1000). */
export function abBoard(tests: RefDto[], measures: MeasureDto[]): AbBoardItem[] {
  return tests.map((test) => {
    const mine = measures.filter((m) => m.abId === test.id);
    const pick = (arm: string) => mine.filter((m) => m.arm === arm).map(savesSharesPer1000).filter((x): x is number => x != null);
    const values = { A: pick("A"), B: pick("B") };
    return { test, values, call: abVerdict(values.A, values.B) };
  });
}


// ---------------------------------------------------------------- små UI-regler (rene, så de kan testes)

const MEASURE_NUMBERS = new Set(["views", "saves", "shares", "newFollowers", "profileVisits", "linkClicks", "inquiries", "skipPct", "fullViewPct", "watchS"]);
/** Formularens tekstfelter → serverens payload: tomme felter udelades, tal sendes som tal. */
export function measurePayload(form: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(form)) if (v !== "") out[k] = MEASURE_NUMBERS.has(k) ? Number(v) : v;
  return out;
}

/** Planer der gled forbi før denne uge. Postet er overstået og hører ikke med. */
export function slippedBefore<T extends { status: string; plannedFor: string | null }>(drafts: T[], firstDay: string): T[] {
  return drafts.filter((d) => d.status !== "droppet" && d.status !== "postet" && d.plannedFor != null && d.plannedFor < firstDay);
}

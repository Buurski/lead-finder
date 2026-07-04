// subscriptions.ts — faste abonnementer + hvem der bærer udgiften.
// Redigér listen her; /okonomi renderer den direkte. Ingen DB — beløb
// ændrer sig sjældent, og en kodeændring er et fint audit-trail.
//
// share-model:
//   "lucas"   — kun Lucas (fx Hermes/hjernen, som Charlie ikke er del af endnu)
//   "charlie" — kun Charlie (fx hans egen Claude Max)
//   "selskab" — selskabsudgift; indtil selskabet betaler selv, splittes 50/50

export type Share = "lucas" | "charlie" | "selskab";
export type Period = "md" | "år";
export type Currency = "DKK" | "USD" | "EUR";

export interface Subscription {
  name: string;
  amount: number;
  currency: Currency;
  period: Period;
  share: Share;
  /** hvem der pt. har kortet i */
  payer: "lucas" | "charlie";
  estimate?: boolean; // beløb ikke bekræftet mod kvittering
  note?: string;
}

// ponytail: faste kurser, ret dem hvis de skrider — præcision på øre-niveau er ligegyldig her
export const RATES: Record<Currency, number> = { DKK: 1, USD: 6.9, EUR: 7.46 };

// Beløb verificeret mod kvitteringer i buur.aigro 2026-07-04 (Vercel #2006-3513,
// Google "Betaling modtaget" 3/7, Contabo ordre 15069280). Claude Max-kvitteringer
// ligger i personlige indbakker — beløb kendt ($100/md pr. plan).
export const SUBSCRIPTIONS: Subscription[] = [
  { name: "Claude Max (Lucas)", amount: 100, currency: "USD", period: "md", share: "lucas", payer: "lucas", note: "Personlig plan" },
  { name: "Claude Max (Charlie)", amount: 100, currency: "USD", period: "md", share: "charlie", payer: "charlie", note: "Personlig plan" },
  { name: "Vercel Pro (2 seats)", amount: 50, currency: "USD", period: "md", share: "selskab", payer: "lucas", note: "Hosting — $40 + 25% moms, kvittering 3/7" },
  { name: "Google Cloud (Places API m.m.)", amount: 100, currency: "DKK", period: "md", share: "selskab", payer: "lucas", note: "Betaling 100 kr 3/7 — variabel, budget-guard aktiv" },
  { name: "Contabo VPS (Hermes)", amount: 6.88, currency: "EUR", period: "md", share: "lucas", payer: "lucas", note: "Hjernen — Charlie ikke med endnu" },
  { name: "Kie.ai (billede/video-gen)", amount: 50, currency: "DKK", period: "md", share: "selskab", payer: "lucas", estimate: true, note: "Uregelmæssige kredit-køb, ~snit" },
];

/** Normaliseret månedspris i DKK. */
export function monthlyDkk(s: Subscription): number {
  const dkk = s.amount * RATES[s.currency];
  return s.period === "år" ? dkk / 12 : dkk;
}

export interface SplitTotals {
  lucas: number;
  charlie: number;
  selskab: number;
  /** hvad hver reelt skylder pr. md når selskabsposter deles 50/50 */
  owedLucas: number;
  owedCharlie: number;
  total: number;
}

export function computeSplit(subs: Subscription[] = SUBSCRIPTIONS): SplitTotals {
  let lucas = 0, charlie = 0, selskab = 0;
  for (const s of subs) {
    const m = monthlyDkk(s);
    if (s.share === "lucas") lucas += m;
    else if (s.share === "charlie") charlie += m;
    else selskab += m;
  }
  return {
    lucas, charlie, selskab,
    owedLucas: lucas + selskab / 2,
    owedCharlie: charlie + selskab / 2,
    total: lucas + charlie + selskab,
  };
}

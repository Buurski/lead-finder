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

export const SUBSCRIPTIONS: Subscription[] = [
  { name: "Claude Max (Lucas)", amount: 100, currency: "USD", period: "md", share: "lucas", payer: "lucas", note: "Personlig plan" },
  { name: "Claude Max (Charlie)", amount: 100, currency: "USD", period: "md", share: "charlie", payer: "charlie", note: "Personlig plan" },
  { name: "Vercel Pro", amount: 20, currency: "USD", period: "md", share: "selskab", payer: "lucas", estimate: true, note: "Hosting lead-system + demoer + buur-cms" },
  { name: "Google Cloud (Places API m.m.)", amount: 150, currency: "DKK", period: "md", share: "selskab", payer: "lucas", estimate: true, note: "Variabel — budget-guard 1500 kald/dag" },
  { name: "Contabo VPS (Hermes)", amount: 8, currency: "EUR", period: "md", share: "lucas", payer: "lucas", estimate: true, note: "Hjernen — Charlie ikke med endnu" },
  { name: "Kie.ai (billede/video-gen)", amount: 50, currency: "DKK", period: "md", share: "selskab", payer: "lucas", estimate: true, note: "Forbrugsbaseret" },
  { name: "Domæner (.dk)", amount: 300, currency: "DKK", period: "år", share: "selskab", payer: "lucas", estimate: true, note: "vida-klinik.dk m.fl." },
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

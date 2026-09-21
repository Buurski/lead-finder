// labels.ts — Lucas' egne domme om et lead, gemt som træningsdata.
//
// Hvorfor det her findes (2026-09-21): tre runder hvor jeg gættede nye
// Jev-spørgsmål gav ét brugbart signal. ÉN runde hvor jeg målte mod Lucas'
// eksisterende `interested`/`bad_fit`-markeringer fandt at scoren var bygget
// på den forkerte variabel — AUC gik fra 0,445 til 0,834. Hans domme er
// simpelthen mere værd end mine hypoteser.
//
// Problemet med de eksisterende markeringer er at de er et biprodukt: de
// findes kun for leads han allerede har arbejdet med, de er få, og de blandes
// sammen med mine egne oprydnings-labels. Det her er en ren kilde: ét klik pr.
// kladde i /godkendelse, tidsstemplet, append-only.
//
// OBSERVERER KUN. En label ændrer ingen status, sender intet, sletter intet.
// Den ligger klar til næste kalibrering.

import { store } from "../store.ts";

export type LabelValue = "god" | "daarlig";

export interface LeadLabel {
  draftId: string;
  leadId: string;
  /** Kopieret med, så en label stadig kan læses efter kladden er væk fra køen. */
  name: string;
  branch: string;
  city: string;
  label: LabelValue;
  /** Attraktivitet og kladde-kvalitet DA labelen blev sat — så en senere
   * måling kan se hvad modellen mente, uden at skulle genskabe historien. */
  jevLead: number | null;
  jevDraft: number | null;
  at: string;
}

export const LABEL_PREFIX = "jev-label/";
const LOG_KEY = "jev-label-log";

export function isLabelValue(v: unknown): v is LabelValue {
  return v === "god" || v === "daarlig";
}

export async function loadLabels(): Promise<LeadLabel[]> {
  const keys = await store.list(LABEL_PREFIX);
  const recs = await Promise.all(keys.map((k) => store.get<LeadLabel>(k)));
  return recs.filter((r): r is LeadLabel => !!r && isLabelValue(r.label));
}

/**
 * Gem (eller overskriv) en label. Append-only loggen skrives FØRST, samme
 * rækkefølge som jev-shadow: fejler `put` bagefter, har vi stadig historikken.
 * At overskrive er med vilje — Lucas må gerne ombestemme sig, og loggen
 * beholder begge domme.
 */
export async function saveLabel(rec: LeadLabel): Promise<void> {
  await store.append(LOG_KEY, rec);
  await store.put(LABEL_PREFIX + rec.draftId, rec);
}

export async function deleteLabel(draftId: string): Promise<void> {
  await store.append(LOG_KEY, { draftId, label: null, at: new Date().toISOString() });
  await store.delete(LABEL_PREFIX + draftId);
}

/** Hvor mange labels har vi, og er der nok til at måle på? */
export function labelStats(labels: LeadLabel[]): { god: number; daarlig: number; nok: boolean } {
  const god = labels.filter((l) => l.label === "god").length;
  const daarlig = labels.length - god;
  // Under ~25 i hver gruppe er en AUC-måling for støjende til at ændre vægte på:
  // standardfejlen bliver da omkring 0,07, altså på niveau med de forskelle vi
  // leder efter. 25/25 er ikke en magisk grænse, bare det punkt hvor tallet
  // begynder at betyde noget.
  return { god, daarlig, nok: god >= 25 && daarlig >= 25 };
}

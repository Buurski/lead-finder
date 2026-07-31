// Én kilde til "hvad skal jeg gøre nu?".
//
// Logikken lå før duplikeret to steder inde i MissionControl (header-CTA'en og
// HeroNumber), så en ændret prioritet ét sted gav to forskellige svar på samme
// skærm. Ren funktion, ingen server-imports — den importeres fra en client
// component.
//
// Hovedreglen: en OFFLINE kilde må aldrig blive en presserende handling.
// Kan et trin ikke afgøres, springes det over — "vi ved det ikke" er ikke det
// samme som "der er ikke noget at gøre", og det siges højt til sidst.

import type { DeckSummary } from "./deck";

/** daily-lead-gen sourcer kun når køen er nede på dette antal. Se scheduler-arkitektur.md. */
export const LEADGEN_GATE_PENDING = 20;

export type ActionSource = "replies" | "queue" | "previews" | "clients" | "okonomi" | "leads" | "none";

export interface NextAction {
  label: string;
  href: string;
  /** Hvorfor netop denne handling — vises som forklaring, ikke som pynt. */
  reason: string;
  /** 1 = mest presserende. Følger prioritetsstigen nedenfor. */
  priority: number;
  source: ActionSource;
  /** Tallet bag handlingen — så UI'et aldrig selv skal gætte hvilket trin der vandt. */
  count: number;
  /** true = kilden bag handlingen er offline/ukendt. Aldrig urgent. */
  degraded?: boolean;
}

/**
 * Prioritetsstigen — første trin med et positivt signal vinder:
 *  1. svar der kræver Lucas/Charlie
 *  2. godkendelseskøen
 *  3. gratis udkast klar til gennemsyn
 *  4. kunde blokeret (mangler brief)
 *  5. økonomi der kræver opmærksomhed (live site uden pris)
 *  6. lead der skal følges op
 *  7. find nye leads (eller: sig det, hvis lead-motoren er gået i stå)
 */
export function nextAction(s: DeckSummary): NextAction {
  // Sheets nede → leads-, svar- og kundetal er tomme arrays, ikke nuller. Alt
  // der stammer derfra springes over, så "0" ikke læses som "intet at lave".
  const sheets = s.ok;

  if (sheets && s.numbers.repliesPending > 0) {
    return {
      label: `Besvar ${s.numbers.repliesPending} svar`,
      href: "/replies",
      reason: "Nogen har skrevet tilbage og venter på et svar.",
      priority: 1,
      source: "replies",
      count: s.numbers.repliesPending,
    };
  }

  // Køen ligger i vores egen store og er derfor pålidelig selv når Sheets er nede.
  if (s.queue.pending > 0) {
    return {
      label: `Godkend ${s.queue.pending} udkast`,
      href: "/approve",
      reason: "Udkast venter på din godkendelse før de kan sendes.",
      priority: 2,
      source: "queue",
      count: s.queue.pending,
    };
  }

  // previews er optional på DeckSummary: mangler feltet, er kilden ikke leveret
  // — så springer vi trinnet over i stedet for at gætte på nul.
  if (s.previews?.ok && s.previews.ready > 0) {
    return {
      label: `Se ${s.previews.ready} gratis udkast`,
      href: "/previews",
      reason: "Demoer er bygget færdig og mangler kun dit gennemsyn.",
      priority: 3,
      source: "previews",
      count: s.previews.ready,
    };
  }

  if (s.clientHealth?.ok && s.clientHealth.blocked > 0) {
    return {
      label: s.clientHealth.blocked === 1 ? "Udfyld manglende brief" : `Udfyld ${s.clientHealth.blocked} manglende briefs`,
      href: "/clients",
      reason: "Der kan ikke bygges videre på kunden før briefen er udfyldt.",
      priority: 4,
      source: "clients",
      count: s.clientHealth.blocked,
    };
  }

  if (s.clientHealth?.ok && s.clientHealth.liveWithoutFee > 0) {
    return {
      label: "Sæt pris på live kunde",
      href: "/clients",
      reason: "Et live site har ingen pris — enten aftalt gratis eller ikke tastet ind.",
      priority: 5,
      source: "okonomi",
      count: s.clientHealth.liveWithoutFee,
    };
  }

  if (sheets && s.needsYou.length > 0) {
    return {
      label: `Følg op på ${s.needsYou.length} lead`,
      href: "/leads",
      reason: "Leads med svar eller aftalt opkald der ikke er lukket endnu.",
      priority: 6,
      source: "leads",
      count: s.needsYou.length,
    };
  }

  // Lead-feeden er tavs. At sige "find nye leads" ville sende Lucas til en side
  // der ikke har fået ny data i ugevis. To vidt forskellige årsager, to svar:
  // enten er køen fuld (daily-lead-gen er gated til kun at source ved ≤20
  // pending og springer korrekt over), eller også er motoren reelt gået i stå.
  const deadLeadgen = s.feeds?.find((f) => f.key === "leadgen" && f.status === "dead");
  if (deadLeadgen) {
    const days = Math.floor((deadLeadgen.ageHours ?? 0) / 24);
    const gated = s.queue.pending > LEADGEN_GATE_PENDING;
    return {
      label: gated ? "Tøm godkendelseskøen" : "Lead-motoren er gået i stå",
      href: gated ? "/approve" : "/leadgen",
      reason: gated
        ? `Lead-motoren har holdt pause i ${days} dage med vilje — den sourcer først igen når køen er nede på ${LEADGEN_GATE_PENDING}.`
        : `Nye leads har ikke leveret i ${days} dage, og køen er tom — motoren burde have kørt.`,
      priority: 7,
      source: "leads",
      count: gated ? s.queue.pending : days,
      // Gated er ikke en fejl — det er systemet der gør som aftalt.
      degraded: !gated,
    };
  }

  if (sheets && s.numbers.contactable > 0) {
    return {
      label: "Find nye leads",
      href: "/leadgen",
      reason: "Ingen hastesager — der er leads klar til at blive kontaktet.",
      priority: 7,
      source: "leads",
      count: s.numbers.contactable,
    };
  }

  // Intet positivt signal. Enten er der reelt ro på, eller også kunne vi ikke se
  // efter. De to må ikke ligne hinanden.
  if (!sheets) {
    return {
      label: "Tjek dataforbindelsen",
      href: "/settings",
      reason: "Google Sheets svarer ikke, så leads, svar og kunder kan ikke vurderes lige nu.",
      priority: 99,
      source: "none",
      count: 0,
      degraded: true,
    };
  }

  return {
    label: "Åbn gratis udkast",
    href: "/previews",
    reason: "Ingenting haster lige nu.",
    priority: 8,
    source: "none",
    count: 0,
  };
}

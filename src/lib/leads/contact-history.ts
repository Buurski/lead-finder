// contact-history.ts — per-lead kontakt-historik til godkendelses-køen
// (session 5-udvidelse, 2026-07-18).
//
// Bygger ét indeks over alle IKKE-kontaktbare leads (= dem vi har rørt før)
// PLUS køens egne sendte kladder, med: hvornår sidst kontaktet, om de svarede
// (ja/nej/aldrig/ukendt), dage siden, og en varme-vurdering. Bruges af
// GET /api/approve/queue til at berige drafts, og af "reject-seen"-oprydningen.
//
// Pure + strip-safe (ingen node-imports) så tests og engine kan importere den.

import type { Lead } from "../sheets.ts";
import type { QueueDraft } from "../queue.ts";
import { isContactable, makeEmailBlock, addEmailToBlock, emailDomainOf, type EmailBlock } from "./contactable.ts";
import { bizKey } from "./suppress.ts";

// "ukendt" = kø-sendt kladde hvor svaret ikke kan ses nogen steder (fx ingen
// Sheets-række) — vi må ikke påstå hverken ja, nej eller "aldrig svaret".
export type Replied = "ja" | "nej" | "aldrig" | "ukendt";
export type Warmth = "varm" | "lun" | "kold" | "død";

export interface ContactRecord {
  reason: string;
  lastContactAt: string | null; // ISO-dato eller null (kontaktet, men dato ukendt)
  daysSince: number | null;
  replied: Replied;
  warmth: Warmth;
}

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

const SAID_NO = new Set(["not-interested", "ikke-interesseret", "ikke interesseret", "nej", "skip", "frasorteret"]);
const SAID_YES = new Set(["interested", "interesseret", "client", "kunde"]);

const parseDate = (s: string | undefined): Date | null => {
  if (!s || !s.trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Seneste kontaktdato for et lead: max(emailSentAt, followupSentAt). */
export function lastContactDate(lead: Lead): Date | null {
  const a = parseDate(lead.emailSentAt);
  const b = parseDate(lead.followupSentAt);
  if (a && b) return a > b ? a : b;
  return a ?? b;
}

export function repliedState(lead: Lead): Replied {
  if (SAID_NO.has(norm(lead.status))) return "nej";
  if (norm(lead.emailStatus) === "replied" || SAID_YES.has(norm(lead.status))) return "ja";
  return "aldrig";
}

// Varme-regler (Lucas, 2026-07-18): svarede nej = død (kontakt aldrig igen).
// Svarede ja: varm ≤7 dage, lun ≤30, ellers kold. Aldrig svaret: lun ≤5 dage
// (mail ligger måske stadig i indbakken), derefter kold — "5 dage siden så er
// de jo ikke varme nu".
export function warmthOf(replied: Replied, daysSince: number | null): Warmth {
  if (replied === "nej") return "død";
  if (replied === "ja") {
    if (daysSince === null) return "lun";
    return daysSince <= 7 ? "varm" : daysSince <= 30 ? "lun" : "kold";
  }
  if (daysSince === null) return "kold";
  return daysSince <= 5 ? "lun" : "kold";
}

export function contactRecordOf(lead: Lead, now: Date): ContactRecord {
  const last = lastContactDate(lead);
  const daysSince = last ? Math.max(0, Math.floor((now.getTime() - last.getTime()) / 86_400_000)) : null;
  const replied = repliedState(lead);
  const reason = replied === "nej" ? "svarede nej"
    : replied === "ja" ? "svarede"
    : lead.followupSentAt ? `follow-up ${lead.followupSentAt.slice(0, 10)}`
    : lead.emailSentAt ? `mail sendt ${lead.emailSentAt.slice(0, 10)}`
    : lead.status ? `status: ${lead.status}`
    : "kontaktet";
  return { reason, lastContactAt: last ? last.toISOString().slice(0, 10) : null, daysSince, replied, warmth: warmthOf(replied, daysSince) };
}

export interface ContactIndex {
  byKey: Map<string, ContactRecord>;      // bizKey(name, city) → record
  byEmail: Map<string, ContactRecord>;    // eksakt email → record
  byDomain: Map<string, ContactRecord>;   // ikke-freemail-domæne → record
  emailBlock: EmailBlock;                 // hurtig blocks()-check (spejl af contactable)
  /** Slå en draft op: navn+by først, ellers email/domæne. */
  lookup(name: string, city: string, email: string | undefined): ContactRecord | null;
}

/**
 * Byg indekset fra alle Sheets-leads (kun !isContactable indgår) PLUS køens
 * egne sendte kladder (Lucas 2026-09-22: "tjek alle leads om de har været i
 * mail før"). Kø-siden fanger forretninger vi har mailet FRA godkendelses-køen
 * — ofte uden Sheets-række. Sheets vinder ved overlap: kø-records udfylder kun
 * huller, så svar-status fra arket aldrig overskrives.
 */
export function buildContactIndex(
  leads: Lead[],
  now: Date = new Date(),
  sentDrafts: QueueDraft[] = [],
): ContactIndex {
  const byKey = new Map<string, ContactRecord>();
  const byEmail = new Map<string, ContactRecord>();
  const byDomain = new Map<string, ContactRecord>();
  const emailBlock = makeEmailBlock();

  // Nyeste kontakt vinder ved nøgle-kollision (samme forretning i to rækker).
  const better = (a: ContactRecord | undefined, b: ContactRecord): ContactRecord => {
    if (!a) return b;
    if ((b.lastContactAt ?? "") > (a.lastContactAt ?? "")) return b;
    return a;
  };

  for (const l of leads) {
    if (isContactable(l)) continue;
    const rec = contactRecordOf(l, now);
    const k = bizKey(l.name, l.city);
    if (k) byKey.set(k, better(byKey.get(k), rec));
    const e = norm(l.email);
    if (e && e.includes("@")) {
      byEmail.set(e, better(byEmail.get(e), rec));
      addEmailToBlock(emailBlock, e);
      const d = emailDomainOf(e);
      if (d && emailBlock.domains.has(d)) byDomain.set(d, better(byDomain.get(d), rec));
    }
  }

  // Køens egne sendte kladder: forretninger vi har mailet fra godkendelses-køen
  // (også dem uden Sheets-række). Uden dem kunne en kladde for samme forretning
  // fremstå som "aldrig set" og blive sendt til to gange. replied sættes til
  // "ukendt" — svaret er ikke sporet for kø-only-forretninger.
  for (const d of sentDrafts) {
    if (d.status !== "sent") continue;
    const at = parseDate(d.updatedAt) ?? parseDate(d.createdAt);
    const daysSince = at ? Math.max(0, Math.floor((now.getTime() - at.getTime()) / 86_400_000)) : null;
    const sentDay = (d.updatedAt ?? d.createdAt ?? "").slice(0, 10);
    const rec: ContactRecord = {
      reason: `sendt via køen ${sentDay}`,
      lastContactAt: at ? at.toISOString().slice(0, 10) : null,
      daysSince,
      replied: "ukendt",
      warmth: warmthOf("ukendt", daysSince),
    };
    const k = bizKey(d.name, d.city);
    if (k && !byKey.has(k)) byKey.set(k, rec);
    const e = norm(d.recipientEmail);
    if (e && e.includes("@")) {
      if (!byEmail.has(e)) byEmail.set(e, rec);
      addEmailToBlock(emailBlock, e);
      const dom = emailDomainOf(e);
      if (dom && emailBlock.domains.has(dom) && !byDomain.has(dom)) byDomain.set(dom, rec);
    }
  }

  return {
    byKey, byEmail, byDomain, emailBlock,
    lookup(name: string, city: string, email: string | undefined): ContactRecord | null {
      const k = bizKey(name, city);
      if (k && byKey.has(k)) return byKey.get(k)!;
      const e = norm(email);
      if (e && e.includes("@")) {
        if (byEmail.has(e)) return byEmail.get(e)!;
        const d = emailDomainOf(e);
        if (d && byDomain.has(d)) return byDomain.get(d)!;
      }
      return null;
    },
  };
}

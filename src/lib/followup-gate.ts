// Send-rutens smalle undtagelse for opfølgninger (spec §11). Normalt må samme
// lead/adresse aldrig mailes to gange. En opfølgning må — men KUN hvis den
// fortsætter en sekvens der faktisk er startet, til en adresse der allerede er
// skrevet til, med nok afstand, og hvis trinnet passer med antal sendte mails.
// canSendTo (svaret/bounced/afmeldt/delt adresse) gælder stadig bagefter.
//
// Opus-review 22/9: undtagelsen må ikke kunne udløses af en sendt kladde der
// (via et forældet kø-snapshot eller en manuel "nulstil") er blevet "godkendt"
// igen — derfor de varige tjek på sidste kontakt og antal sendte.

export const MAX_TOUCHES = 5;
/** Mindste afstand mellem to mails i en sekvens (mindste GAP_DAYS er 5). */
export const MIN_GAP_MS = 4 * 86_400_000;

export interface FollowUpDraftLike {
  source?: string;
  step?: number;
  leadId?: string;
}

export interface FollowUpLeadLike {
  id: string;
  email?: string;
  status?: string;
  emailSentAt?: string;
  followupSentAt?: string;
}

export interface SentLedger {
  /** Antal sendte kladder pr. leadId. */
  sentCount: Map<string, number>;
  /** Adresser der faktisk er sendt til pr. leadId. */
  recipients: Map<string, Set<string>>;
}

export function isFollowUpDraft(d: FollowUpDraftLike): boolean {
  return d.source === "opfoelgning" && (d.step ?? 1) >= 2;
}

/** Bygger ledgeren fra køens sendte kladder. */
export function buildSentLedger(drafts: Array<{ leadId?: string; status?: string; recipientEmail?: string }>): SentLedger {
  const sentCount = new Map<string, number>();
  const recipients = new Map<string, Set<string>>();
  for (const d of drafts) {
    if (d.status !== "sent" || !d.leadId) continue;
    sentCount.set(d.leadId, (sentCount.get(d.leadId) ?? 0) + 1);
    if (d.recipientEmail) {
      const set = recipients.get(d.leadId) ?? new Set<string>();
      set.add(d.recipientEmail.trim().toLowerCase());
      recipients.set(d.leadId, set);
    }
  }
  return { sentCount, recipients };
}

function lastContactMs(lead: FollowUpLeadLike): number {
  const ts = [lead.emailSentAt, lead.followupSentAt].map((v) => Date.parse(v || "")).filter(Number.isFinite);
  return ts.length ? Math.max(...ts) : NaN;
}

/**
 * ok = må springe "allerede kontaktet"-tjekkene over.
 * Kaldes kun for opfølgnings-kladder; en afvist opfølgning springes over med `reason`.
 */
export function followUpAllowed(
  d: FollowUpDraftLike,
  lead: FollowUpLeadLike | undefined,
  targetKey: string,
  ctx: { ledger: SentLedger; sentThisRun: Set<string>; now?: number },
): { ok: true } | { ok: false; reason: string } {
  if (!lead || !d.leadId) return { ok: false, reason: "opfølgning uden lead" };
  // Kun præcis det lead sekvensen startede på — aldrig et navne-match på en anden række
  // (så kunne et svar/afmelding på den oprindelige række omgås; Sol 23/9).
  if (lead.id !== d.leadId) return { ok: false, reason: "opfølgning matcher ikke kladdens lead" };
  const step = d.step ?? 1;
  if (step > MAX_TOUCHES) return { ok: false, reason: "opfølgning over loftet" };
  const st = (lead.status || "").trim().toLowerCase();
  if (st === "not-interested" || st === "skip" || st === "client") return { ok: false, reason: "opfølgning stoppet (status)" };

  const sent = ctx.ledger.sentCount.get(d.leadId) ?? 0;
  const legacySent = Boolean((lead.emailSentAt || "").trim()); // første mail sendt før køen fandtes
  if (sent === 0 && !legacySent) return { ok: false, reason: "opfølgning uden tidligere mail" };
  // Trinnet skal passe med antal sendte: en sendt opfølgning der "godkendes" igen falder her.
  if (sent > 0 && sent !== step - 1) return { ok: false, reason: `trin ${step} passer ikke med ${sent} sendte` };

  // Kun til en adresse der faktisk er skrevet til før.
  const known = ctx.ledger.recipients.get(d.leadId);
  const priorAddress = known && known.size ? known.has(targetKey) : (lead.email || "").trim().toLowerCase() === targetKey;
  if (!priorAddress) return { ok: false, reason: "opfølgning til anden adresse end før" };

  const last = lastContactMs(lead);
  if (Number.isFinite(last) && (ctx.now ?? Date.now()) - last < MIN_GAP_MS) return { ok: false, reason: "for kort tid siden sidste mail" };
  if (ctx.sentThisRun.has(d.leadId)) return { ok: false, reason: "allerede fulgt op i denne kørsel" };
  return { ok: true };
}

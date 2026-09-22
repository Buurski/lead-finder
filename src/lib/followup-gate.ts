// Send-rutens smalle undtagelse for opfølgninger (spec §11). Normalt må samme
// lead/adresse aldrig mailes to gange. En opfølgning må — men KUN hvis den
// fortsætter en sekvens der faktisk er startet, til præcis samme adresse.
// canSendTo (svaret/bounced/afmeldt/delt adresse) gælder stadig bagefter.

export interface FollowUpDraftLike {
  source?: string;
  step?: number;
  leadId?: string;
}

export interface FollowUpLeadLike {
  email?: string;
  status?: string;
  emailSentAt?: string;
}

export function isFollowUpDraft(d: FollowUpDraftLike): boolean {
  return d.source === "opfoelgning" && (d.step ?? 1) >= 2;
}

/**
 * ok = må springe "allerede kontaktet"-tjekkene over.
 * Kaldes kun for opfølgnings-kladder; en afvist opfølgning springes over med `reason`.
 */
export function followUpAllowed(
  d: FollowUpDraftLike,
  lead: FollowUpLeadLike | undefined,
  targetKey: string,
  ctx: { priorSentLeadIds: Set<string>; sentThisRun: Set<string> },
): { ok: true } | { ok: false; reason: string } {
  if (!lead || !d.leadId) return { ok: false, reason: "opfølgning uden lead" };
  const st = (lead.status || "").trim().toLowerCase();
  if (st === "not-interested" || st === "skip" || st === "client") return { ok: false, reason: "opfølgning stoppet (status)" };
  if (!ctx.priorSentLeadIds.has(d.leadId) && !(lead.emailSentAt || "").trim()) return { ok: false, reason: "opfølgning uden tidligere mail" };
  if ((lead.email || "").trim().toLowerCase() !== targetKey) return { ok: false, reason: "opfølgning til anden adresse end før" };
  if (ctx.sentThisRun.has(d.leadId)) return { ok: false, reason: "allerede fulgt op i denne kørsel" };
  return { ok: true };
}

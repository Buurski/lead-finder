// "Lav mail-kladde" fra en virksomhedsprofil (Lucas 23/9: "jeg tog nogen herind,
// og de er ikke kommet ind i godkendelse"). Virksomheder oprettet i CRM'et har
// negativt row_no og ses aldrig af lead-motoren, så kladden komponeres her
// direkte fra virksomhedens række og lægges i samme godkendelses-kø. Intet sendes.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company } from "../db/schema.ts";
import { composeColdEmail } from "../compose.ts";
import { adaptToSender } from "../tone-mixer.ts";
import { hasUsableEmail } from "../leads/channel.ts";
import type { QueueDraft } from "../queue.ts";

export class DraftInputError extends Error {}

const STOP = new Set(["not-interested", "skip", "client", "interested", "replied"]);

export async function draftForCompany(
  db: Pick<Db, "select">,
  companyId: string,
  sender: "lucas" | "charlie",
  now = new Date(),
): Promise<{ draftId: string }> {
  const [c] = await db.select().from(company).where(eq(company.id, companyId)).limit(1);
  if (!c) throw new DraftInputError("virksomheden findes ikke");
  if (c.clientNo != null && !c.clientRemoved) throw new DraftInputError("det er en kunde — brug en kundeopdatering i stedet");
  if (STOP.has(c.leadStatus)) throw new DraftInputError(`status er "${c.leadStatus}" — ingen kold mail`);
  if (c.emailSentAt.trim()) throw new DraftInputError(`der er allerede sendt en mail (${c.emailSentAt.slice(0, 10)}) — brug en opfølgning`);
  if (!hasUsableEmail(c.email)) throw new DraftInputError("virksomheden mangler en brugbar mailadresse — tilføj den først");

  const leadId = c.placeId || (c.rowNo > 0 ? String(c.rowNo) : `c:${c.id}`);
  const { appendDrafts, readQueue } = await import("../queue.ts");
  if ((await readQueue()).some((d) => d.leadId === leadId && ["approved", "edited", "sending", "sent"].includes(d.status))) {
    throw new DraftInputError("der findes allerede en godkendt eller sendt kladde — brug en opfølgning");
  }

  const mail = composeColdEmail({
    name: c.name,
    branch: c.branch,
    city: c.city,
    reviewsCount: c.reviewsCount,
    websiteStatus: c.websiteStatus,
  });
  const iso = now.toISOString();
  const draft: QueueDraft = {
    id: `d_crm_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    leadId,
    name: c.name,
    branch: c.branch,
    city: c.city,
    hooks: [],
    demoPair: mail.demoPair,
    // C4: skabelon ud fra CRM-felter, ikke research — skal kunne ses i /approve.
    professionalism: "Standard-kladde fra skabelon (ikke researchet) — tjek teksten",
    subject: mail.subject,
    body: adaptToSender(mail.text, sender),
    recipientEmail: c.email.trim().toLowerCase(),
    website: c.website,
    reviewsCount: c.reviewsCount,
    status: "pending",
    source: "write-to-x",
    createdAt: iso,
    updatedAt: iso,
    comboId: mail.comboId,
    openerKind: mail.openerKind,
    sender,
  };

  const merged = await appendDrafts([draft], now.getTime());
  // appendDrafts springer over hvis samme virksomhed allerede har en åben/sendt kladde.
  if (!merged.some((d) => d.id === draft.id)) {
    throw new DraftInputError("der ligger allerede en åben eller sendt kladde til denne virksomhed");
  }
  return { draftId: draft.id };
}

// Kunde-adresser til mail→CRM-sync (Hermes' crm-mail-sync-cron, 26/9): før var
// kundelisten hardkodet i VPS-scriptet (4 kunder, aldrig opdateret). Nu henter
// scriptet den her (via /api/agent/read?what=customer-contacts) og matcher mails
// på deltager-adresser (From/To/Cc), aldrig fritekst i mailen.
//
// "Kunde" = lifecycle 'kunde', plus varme leads (interesseret/svaret/kontaktet)
// der allerede har en aftale i gang (tilbud/aftalt/i_gang) — de skriver ofte mail
// før den formelle kunde-overgang, og skal ikke tabes af sync'en.
import "server-only";
import { inArray } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company, contact, deal } from "../db/schema.ts";
import { normalizeStage } from "./deals.ts";

export interface CustomerContact {
  id: string;
  name: string;
  emails: string[];
  domains: string[];
}

const WARM_LIFECYCLE = new Set(["interesseret", "svaret", "kontaktet"]);
const WARM_DEAL_STAGES = new Set(["tilbud", "aftalt", "i_gang"]);

function hostnameOf(website: string): string | null {
  const w = website.trim();
  if (!w) return null;
  try {
    return new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return null;
  }
}

export async function listCustomerContacts(db: Db): Promise<CustomerContact[]> {
  const companies = await db.select().from(company);
  const warmIds = companies.filter((c) => WARM_LIFECYCLE.has(c.lifecycle)).map((c) => c.id);
  const warmDeals = warmIds.length ? await db.select({ companyId: deal.companyId, stage: deal.stage }).from(deal).where(inArray(deal.companyId, warmIds)) : [];
  const warmWithDeal = new Set(warmDeals.filter((d) => WARM_DEAL_STAGES.has(normalizeStage(d.stage))).map((d) => d.companyId));

  const eligible = companies.filter((c) => c.lifecycle === "kunde" || warmWithDeal.has(c.id));
  if (!eligible.length) return [];

  const contacts = await db.select().from(contact).where(inArray(contact.companyId, eligible.map((c) => c.id)));
  const emailsByCompany = new Map<string, Set<string>>();
  for (const ct of contacts) {
    if (!ct.email || !ct.companyId) continue;
    const set = emailsByCompany.get(ct.companyId) ?? new Set<string>();
    set.add(ct.email.trim().toLowerCase());
    emailsByCompany.set(ct.companyId, set);
  }

  return eligible.map((c) => {
    const emails = emailsByCompany.get(c.id) ?? new Set<string>();
    if (c.email) emails.add(c.email.trim().toLowerCase());
    const domain = hostnameOf(c.website);
    return { id: c.id, name: c.name, emails: [...emails], domains: domain ? [domain] : [] };
  });
}

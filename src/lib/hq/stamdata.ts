// Stamdata-redigering på virksomhedsprofilen (navn/telefon/mail/website/by/branche).
// Egen fil (ikke inline i profil/route.ts) så den kan testes uden Request/headers —
// samme greb som phase.ts/deals.ts: actor kommer ind som en almindelig streng.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";

// Egen fejlklasse (ikke HqInputError fra api.ts): api.ts importerer next/server,
// som plain node ikke kan resolve uden Next's egen build — det ville gøre denne
// fil (og dens test) knækkelig. Samme greb som DealInputError/BillingError m.fl.,
// registreret i hqWrite's fangst nedenfor.
export class StamdataError extends Error {}

export interface StamdataPatch {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  website?: unknown;
  city?: unknown;
  branch?: unknown;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Samme regel som site.domain i profil/route.ts: værtsnavn efter evt. protokol/sti.
const DOMAIN_RE = /^[a-z0-9æøå.-]+\.[a-z]{2,}$/i;

const FIELD_LABEL: Record<string, string> = {
  name: "navn",
  phone: "telefon",
  email: "e-mail",
  website: "website",
  city: "by",
  branch: "branche",
};

function text(v: unknown, label: string, max: number): string | null {
  if (v === undefined) return null;
  if (typeof v !== "string" || v.length > max) throw new StamdataError(`${label} er ugyldig`);
  return v.trim();
}

function stripHost(v: string): string {
  return v.replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
}

/** Retter stamdata og logger én "fase"-hændelse med de felter der rent faktisk ændrede sig. */
export async function updateStamdata(db: Db, companyId: string, patch: StamdataPatch, actor: string): Promise<void> {
  const [co] = await db.select().from(company).where(eq(company.id, companyId));
  if (!co) throw new StamdataError("virksomheden findes ikke");

  const set: Partial<typeof company.$inferInsert> = {};

  const name = text(patch.name, "navn", 200);
  if (name !== null) {
    if (!name) throw new StamdataError("navn må ikke være tomt");
    set.name = name;
  }
  const phone = text(patch.phone, "telefon", 40);
  if (phone !== null) set.phone = phone;
  const email = text(patch.email, "e-mail", 160);
  if (email !== null) {
    if (email && !EMAIL_RE.test(email)) throw new StamdataError("e-mail er ugyldig");
    set.email = email;
  }
  const website = text(patch.website, "website", 200);
  if (website !== null) {
    if (website && !DOMAIN_RE.test(stripHost(website))) throw new StamdataError("website er ugyldigt");
    set.website = website;
  }
  const city = text(patch.city, "by", 100);
  if (city !== null) set.city = city;
  const branch = text(patch.branch, "branche", 100);
  if (branch !== null) set.branch = branch;

  const changed = (Object.keys(set) as (keyof typeof set)[]).filter((key) => (co as Record<string, unknown>)[key] !== (set as Record<string, unknown>)[key]);
  if (!changed.length) return;

  await db.update(company).set(set).where(eq(company.id, companyId));
  await db.insert(activity).values({
    companyId,
    clientName: co.name,
    actor,
    type: "fase",
    summary: `Stamdata rettet: ${changed.map((k) => FIELD_LABEL[k] ?? k).join(", ")}`,
  });
}

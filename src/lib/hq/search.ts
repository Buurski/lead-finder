// Global søgning (⌘K-paletten + GET /api/soeg): virksomheder, kontakter,
// aftaler og fakturaer i én liste, grupperet. ILIKE er case/accent-tolerant
// for æøå ud af boksen (Postgres' lower() respekterer UTF8-collation) — ingen
// ekstra normalisering nødvendig.
import "server-only";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company, contact, deal, invoice } from "../db/schema.ts";
import { lifecycleLabel } from "../../components/virksomheder/lifecycle.ts";

export interface SearchHit {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

export interface SearchGroup {
  label: string;
  items: SearchHit[];
}

// ILIKE-metategn er ikke escapet af Postgres — % og _ skal escapes, ellers kan
// søgeteksten selv opføre sig som wildcards (samme mønster som de andre search-ruter).
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function searchAll(db: Db, q: string, limit = 5): Promise<SearchGroup[]> {
  const term = q.trim();
  if (!term) return [];
  const pattern = `%${escapeLike(term)}%`;
  const compact = term.toLowerCase().replace(/[^a-z0-9æøå]/g, "");
  const live = eq(company.archived, false);

  const companies = await db
    .select({ id: company.id, name: company.name, city: company.city, lifecycle: company.lifecycle, clientNo: company.clientNo })
    .from(company)
    // Også uden mellemrum/tegn: "ktvvs" skal finde "KT VVS".
    .where(and(live, compact.length >= 3
      ? or(ilike(company.name, pattern), sql`regexp_replace(lower(${company.name}), '[^a-z0-9æøå]', '', 'g') like ${`%${compact}%`}`)
      : ilike(company.name, pattern)))
    // Kunder (clientNo sat) først, herefter alfabetisk.
    .orderBy(sql`${company.clientNo} is null`, company.name)
    .limit(limit);

  const contacts = await db
    .select({
      id: contact.id,
      name: contact.name,
      clientName: contact.clientName,
      email: contact.email,
      phone: contact.phone,
      companyId: contact.companyId,
      companyName: company.name,
    })
    .from(contact)
    .innerJoin(company, and(eq(company.id, contact.companyId), live))
    .where(or(ilike(contact.name, pattern), ilike(contact.email, pattern), ilike(contact.phone, pattern)))
    .limit(limit);

  const deals = await db
    .select({ id: deal.id, title: deal.title, package: deal.package, companyId: deal.companyId, companyName: company.name })
    .from(deal)
    .innerJoin(company, and(eq(company.id, deal.companyId), live))
    .where(ilike(deal.title, pattern))
    .limit(limit);

  const invoices = await db
    .select({ number: invoice.number, clientName: invoice.clientName })
    .from(invoice)
    .where(or(ilike(invoice.number, pattern), ilike(invoice.clientName, pattern)))
    .limit(limit);

  const groups: SearchGroup[] = [
    {
      label: "Virksomheder",
      items: companies.map((c) => ({
        id: c.id,
        title: c.name || "(uden navn)",
        subtitle: [c.city, c.clientNo !== null ? `Kunde #${c.clientNo}` : lifecycleLabel(c.lifecycle)].filter(Boolean).join(" · "),
        href: `/virksomheder/${c.id}`,
      })),
    },
    {
      label: "Kontakter",
      items: contacts.map((ct) => ({
        id: ct.id,
        title: ct.name || ct.clientName || ct.email || "(uden navn)",
        subtitle: ct.companyName,
        href: `/virksomheder/${ct.companyId}`,
      })),
    },
    {
      label: "Aftaler",
      items: deals.map((d) => ({
        id: d.id,
        title: d.title || d.package || "Aftale",
        subtitle: d.companyName,
        href: `/virksomheder/${d.companyId}`,
      })),
    },
    {
      label: "Fakturaer",
      items: invoices.map((inv) => ({
        id: inv.number,
        title: `Faktura ${inv.number}`,
        subtitle: inv.clientName,
        href: `/fakturaer?clientName=${encodeURIComponent(inv.clientName)}`,
      })),
    },
  ];

  return groups.filter((g) => g.items.length > 0);
}

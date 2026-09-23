// Henvendelser fra kinly.dk (spec fase 6). Formularen POST'er allerede til
// /api/previews (KV-køen til gratis udkast); her kobles den samme henvendelse på
// virksomheden i CRM'et: find eller opret, marker interesseret, log aktivitet,
// og stop kolde kladder — en der selv har skrevet skal ikke have en kold mail.
import { and, eq, max, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, contact } from "../db/schema.ts";

export interface InboundInput {
  id: string; // preview-id — gør kaldet idempotent
  company: string;
  email: string;
  channel: string;
  website?: string;
  contactName?: string;
  branch?: string;
  questionnaire?: string;
}

function host(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\b(aps|a\/s|ivs|i\/s)\b/g, "").replace(/[^a-z0-9æøå]/g, "");
}

function corroborates(c: { name: string; website: string }, name: string, h: string): boolean {
  const ch = host(c.website);
  if (h && ch) return h === ch;
  const a = norm(name);
  const b = norm(c.name);
  return !a || !b || a.includes(b) || b.includes(a);
}

async function findCompany(db: Db, input: InboundInput): Promise<string | null> {
  const live = eq(company.archived, false);
  const email = input.email.trim().toLowerCase();
  const h = host(input.website ?? "");
  if (email) {
    const hits = await db
      .select({ id: company.id, name: company.name, website: company.website })
      .from(company)
      .where(and(live, sql`lower(${company.email}) = ${email}`));
    // Samme mail kan høre til to forretninger: mail-match gælder kun hvis intet
    // i henvendelsen peger på en anden (Sol 23/9).
    const ok = hits.filter((c) => corroborates(c, input.company, h));
    if (ok.length === 1) return ok[0].id;
  }
  if (h) {
    const hits = await db
      .select({ id: company.id, website: company.website })
      .from(company)
      .where(and(live, sql`${company.website} ilike ${"%" + h.replace(/[%_\\]/g, "\\$&") + "%"}`));
    const exact = hits.filter((c) => host(c.website) === h);
    if (exact.length === 1) return exact[0].id;
  }
  const name = input.company.trim();
  if (name) {
    const hits = await db.select({ id: company.id }).from(company).where(and(live, sql`lower(${company.name}) = ${name.toLowerCase()}`));
    if (hits.length === 1) return hits[0].id;
  }
  return null;
}

export async function recordInbound(db: Db, input: InboundInput): Promise<{ companyId: string; created: boolean; rowNo: number; duplicate: boolean }> {
  const legacyId = `preview:${input.id}`;
  return db.transaction(async (tx) => {
    const t = tx as unknown as Db;
    const [seen] = await tx.select({ companyId: activity.companyId }).from(activity).where(eq(activity.legacyId, legacyId));
    if (seen?.companyId) {
      const [c] = await tx.select({ rowNo: company.rowNo }).from(company).where(eq(company.id, seen.companyId));
      return { companyId: seen.companyId, created: false, rowNo: c?.rowNo ?? 0, duplicate: true };
    }

    // Låsen tages FØR opslaget, så to samtidige første-henvendelser ikke begge opretter.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('company_row_no'))`);
    let companyId = await findCompany(t, input);
    let created = false;
    if (!companyId) {
      const [{ value }] = await tx.select({ value: max(company.rowNo) }).from(company);
      const [row] = await tx
        .insert(company)
        .values({
          rowNo: (value ?? 1) + 1,
          name: input.company.trim() || input.email.trim(),
          branch: input.branch?.trim() ?? "",
          email: input.email.trim(),
          website: input.website?.trim() ?? "",
          websiteStatus: input.website ? "has" : "none",
          source: "kinly.dk",
          leadStatus: "interested",
          lastUpdated: new Date().toISOString().slice(0, 10),
        })
        .returning({ id: company.id });
      companyId = row.id;
      created = true;
    } else {
      // Interesseret — men en kunde forbliver kunde.
      await tx.update(company).set({ leadStatus: "interested" }).where(and(eq(company.id, companyId), ne(company.leadStatus, "client")));
    }

    const email = input.email.trim();
    if (email) {
      const [known] = await tx
        .select({ id: contact.id })
        .from(contact)
        .where(and(eq(contact.companyId, companyId), sql`lower(${contact.email}) = ${email.toLowerCase()}`));
      if (!known) await tx.insert(contact).values({ companyId, name: input.contactName?.trim() ?? "", email, role: "henvendelse" });
    }

    const [co] = await tx.select({ name: company.name, rowNo: company.rowNo }).from(company).where(eq(company.id, companyId));
    const what = (input.questionnaire ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    await tx.insert(activity).values({
      legacyId,
      companyId,
      clientName: co.name,
      actor: "system",
      type: "henvendelse",
      summary: `Henvendelse via kinly.dk (${input.channel})${what ? `: ${what}` : ""}`,
      payload: { previewId: input.id, contactName: input.contactName ?? "", email },
    });
    return { companyId, created, rowNo: co.rowNo, duplicate: false };
  });
}

/** Henvendelse → CRM + stop kolde kladder. Idempotent (legacyId), så den trygt kan køres igen. */
export async function linkPreview(db: Db, request: InboundInput): Promise<void> {
  const r = await recordInbound(db, request);
  if (r.rowNo > 0) {
    const { stopOpenForRows } = await import("../pg/queue.ts");
    await stopOpenForRows([r.rowNo], "henvendte sig selv via kinly.dk", new Date().toISOString());
  }
}

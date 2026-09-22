// Flet to virksomheder, der er den samme forretning (dubletter fra scrapet,
// kunde uden lead-række ↔ lead-rækken, fx KT VVS ↔ "KT VVS ApS").
// Alt flyttes til `keep` i én transaktion. `drop` slettes ALDRIG: den arkiveres
// med lifecycle "flettet", så row_no forbliver optaget og kan spores.
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, contact, deal, invoice, outreach, site, subscriptionPlan, task } from "../db/schema.ts";

export class MergeError extends Error {}

// Hvor langt en virksomhed er nået — den der er længst fremme vinder.
const RANK: Record<string, number> = { ikke_egnet: 0, tabt: 1, ny: 2, kontaktet: 3, svaret: 4, interesseret: 5, kunde: 6 };

// Tekstfelter der udfyldes fra drop, KUN hvor keep er tom.
const FILL = [
  "branch", "phone", "city", "source", "website", "notes", "websiteQualityTier", "enrichedInfo", "email",
  "emailSentAt", "emailOpenedAt", "emailClickedAt", "emailStatus", "followupSentAt", "callbackDate",
] as const;

export async function mergeCompanies(db: Db, keepId: string, dropId: string, actor: string): Promise<void> {
  if (keepId === dropId) throw new MergeError("kan ikke flette en virksomhed med sig selv");
  await db.transaction(async (tx) => {
    // Lås begge rækker i fast rækkefølge, så to samtidige fletninger ikke dead-locker.
    const ids = [keepId, dropId].sort();
    await tx.execute(sql`select id from company where id in (${ids[0]}, ${ids[1]}) order by id for update`);
    let [keep] = await tx.select().from(company).where(eq(company.id, keepId));
    let [drop] = await tx.select().from(company).where(eq(company.id, dropId));
    if (!keep || !drop) throw new MergeError("virksomheden findes ikke");
    // Den med en rigtig lead-række (row_no > 0) beholdes altid: gamle kodestier og
    // kladder slår op på Lead.id = row_no, og mail-historikken hænger på den.
    if (drop.rowNo > 0 && keep.rowNo <= 0) {
      [keep, drop] = [drop, keep];
      [keepId, dropId] = [dropId, keepId];
    }
    if (keep.archived && keep.lifecycle === "flettet") throw new MergeError(`${keep.name} er allerede flettet ind i en anden`);
    if (drop.archived && drop.lifecycle === "flettet") throw new MergeError(`${drop.name} er allerede flettet`);
    if (keep.clientNo !== null && drop.clientNo !== null) {
      throw new MergeError("begge er kunder med hvert sit kundenummer — flet dem ikke automatisk");
    }

    // 1. Kun én primær deal pr. virksomhed (unikt indeks): drop's bliver almindelig.
    const [keepPrimary] = await tx.select({ id: deal.id }).from(deal).where(and(eq(deal.companyId, keepId), eq(deal.isPrimary, true)));
    if (keepPrimary) await tx.update(deal).set({ isPrimary: false }).where(eq(deal.companyId, dropId));

    // 2. Flyt alt der peger på drop.
    for (const t of [deal, contact, activity, task, invoice, site, subscriptionPlan] as const) {
      await tx.update(t).set({ companyId: keepId }).where(eq(t.companyId, dropId));
    }
    // Kladdernes join-kolonne følger med (selve draft.leadId i jsonb er historik og røres ikke).
    await tx.update(outreach).set({ companyRowNo: keep.rowNo }).where(eq(outreach.companyRowNo, drop.rowNo));

    // 3. Felter: udfyld keep's huller fra drop; livsfase = den længst fremme.
    const patch: Record<string, unknown> = {};
    for (const f of FILL) if (!keep[f] && drop[f]) patch[f] = drop[f];
    if (!keep.placeId && drop.placeId) patch.placeId = drop.placeId;
    if (!keep.businessStatus && drop.businessStatus) patch.businessStatus = drop.businessStatus;
    patch.reviewsCount = Math.max(keep.reviewsCount, drop.reviewsCount);
    patch.score = Math.max(keep.score, drop.score);
    patch.briefFilled = keep.briefFilled || drop.briefFilled;
    patch.lifecycle = (RANK[drop.lifecycle] ?? 0) > (RANK[keep.lifecycle] ?? 0) ? drop.lifecycle : keep.lifecycle;

    // 4. Arkivér drop FØR keep får dens unikke nøgler (client_no, place_id).
    await tx
      .update(company)
      .set({ archived: true, lifecycle: "flettet", clientNo: null, placeId: null, updatedAt: new Date() })
      .where(eq(company.id, dropId));
    if (keep.clientNo === null && drop.clientNo !== null) {
      patch.clientNo = drop.clientNo;
      patch.clientRemoved = drop.clientRemoved;
      // Kundens navn følger kundenummeret: fakturaer/CRM-poster er gemt under det navn.
      patch.name = drop.name;
    }
    await tx.update(company).set({ ...patch, updatedAt: new Date() }).where(eq(company.id, keepId));

    await tx.insert(activity).values({
      companyId: keepId,
      actor,
      type: "fase",
      summary: `Flettet med ${drop.name} (række ${drop.rowNo})`,
      payload: { mergedFrom: dropId, rowNo: drop.rowNo, clientNo: drop.clientNo },
    });
  });
}

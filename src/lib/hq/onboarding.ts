// "Vundet → kunde + opstart" (bølge 3). At vinde en aftale gør i dag intet ved
// virksomheden — at blive kunde krævede en separat manuel klient-række
// (den gamle AddClientForm/api/clients/add-vej, nu fjernet). makeCustomer()
// er den ene, idempotente overgang: tildel kundenummer, stop kolde kladder,
// og opret opstarts-tjeklisten. Livsfasen ('kunde') udledes selv af
// company_lifecycle-triggeren (drizzle/0003_lifecycle_trigger.sql) ud fra
// client_no + lead_status — vi sætter kun de to felter.
import "server-only";
import { and, eq, max, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, contact, deal, invoice, site, task } from "../db/schema.ts";
import { stopOpenForRows } from "../pg/queue.ts";

// Egen fejlklasse (ikke HqInputError fra ./api.ts): den fil trækker next/server
// ind, som node:test ikke kan resolve uden for Next's runtime. Ruterne
// oversætter denne til HqInputError selv (de kører i Next-konteksten).
export class OnboardingError extends Error {}

export const ONBOARDING_STEPS = [
  "Kontaktperson + mail registreret",
  "Aftale og månedspris på plads",
  "Domæne og adgang (DNS/hosting) modtaget",
  "Første faktura (opstart) sendt",
  "Site live",
  "Google-profil + Search Console sat op",
  "Velkomstmail/kundeopdatering sendt",
] as const;

export interface OnboardingTaskRow {
  id: string;
  title: string;
  due: string;
  done: boolean;
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505");
}

/** Tildeler næste kundenummer (max+1) hvis virksomheden ikke allerede er kunde.
 * Kollision på det unikke client_no-indeks (samtidig tildeling) prøves igen én gang. */
async function assignClientNo(
  db: Db,
  companyId: string,
  actor: string,
): Promise<{ clientNo: number; becameCustomer: boolean; rowNo: number; name: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        const [c] = await tx.select().from(company).where(eq(company.id, companyId)).for("update");
        if (!c) throw new OnboardingError("virksomheden findes ikke");
        if (c.clientNo !== null) {
          if (c.leadStatus !== "client") {
            await tx.update(company).set({ leadStatus: "client", updatedAt: new Date() }).where(eq(company.id, companyId));
          }
          return { clientNo: c.clientNo, becameCustomer: false, rowNo: c.rowNo, name: c.name };
        }
        const [{ value }] = await tx.select({ value: max(company.clientNo) }).from(company);
        const clientNo = (value ?? 0) + 1;
        await tx.update(company).set({ clientNo, leadStatus: "client", updatedAt: new Date() }).where(eq(company.id, companyId));
        await tx.insert(activity).values({ companyId, actor, type: "fase", summary: `Blev kunde (#${clientNo})` });
        return { clientNo, becameCustomer: true, rowNo: c.rowNo, name: c.name };
      });
    } catch (err) {
      if (attempt === 0 && isUniqueViolation(err)) continue;
      throw err;
    }
  }
  throw new OnboardingError("kunne ikke tildele kundenummer — prøv igen");
}

/** Sætter opstarts-tjeklisten op (kun første gang — tjekker via task.data.onboarding).
 * Punkter allerede opfyldt af eksisterende data markeres klaret med det samme. */
async function seedOnboardingTasks(db: Db, companyId: string, companyName: string, actor: string, today: string): Promise<void> {
  const [existing] = await db
    .select({ id: task.id })
    .from(task)
    .where(and(eq(task.companyId, companyId), sql`${task.data} @> '{"onboarding":true}'::jsonb`))
    .limit(1);
  if (existing) return;

  const [c] = await db.select({ email: company.email }).from(company).where(eq(company.id, companyId));
  const contacts = await db.select({ email: contact.email }).from(contact).where(eq(contact.companyId, companyId));
  const [s] = await db.select().from(site).where(eq(site.companyId, companyId)).limit(1);
  const invoiceRows = await db.select({ status: invoice.status }).from(invoice).where(eq(invoice.companyId, companyId));
  const dealRows = await db.select({ mrrDkk: deal.mrrDkk }).from(deal).where(eq(deal.companyId, companyId));
  const [update] = await db
    .select({ id: activity.id })
    .from(activity)
    .where(and(eq(activity.companyId, companyId), eq(activity.type, "kundeopdatering")))
    .limit(1);

  const done = [
    Boolean(c?.email) || contacts.some((x) => x.email),
    dealRows.some((d) => (d.mrrDkk ?? 0) > 0),
    Boolean(s?.domain),
    invoiceRows.some((i) => i.status !== "kladde"),
    s?.status === "live",
    false, // Google-profil/Search Console: intet datasignal at udlede det fra endnu
    Boolean(update),
  ];

  const owner = actor === "charlie" ? "charlie" : "lucas";
  await db.insert(task).values(
    ONBOARDING_STEPS.map((title, i) => ({
      companyId,
      clientName: companyName,
      owner,
      title,
      due: today,
      doneAt: done[i] ? new Date() : null,
      data: { onboarding: true, step: i },
    })),
  );
}

/** "Vundet → kunde + opstart". Idempotent: kald nummer to på en eksisterende
 * kunde ændrer intet (samme kundenummer, ingen dobbelt aktivitet/opstartsliste). */
export async function makeCustomer(db: Db, companyId: string, opts: { actor: string; today: string }): Promise<number> {
  const assigned = await assignClientNo(db, companyId, opts.actor);
  if (assigned.becameCustomer) {
    await stopOpenForRows([assigned.rowNo], "blev kunde", new Date().toISOString());
  }
  await seedOnboardingTasks(db, companyId, assigned.name, opts.actor, opts.today);
  return assigned.clientNo;
}

/** Opstartslisten til profilsiden, i fast rækkefølge. */
export async function getOnboardingChecklist(db: Db, companyId: string): Promise<OnboardingTaskRow[]> {
  const rows = await db
    .select({ id: task.id, title: task.title, due: task.due, doneAt: task.doneAt, data: task.data })
    .from(task)
    .where(and(eq(task.companyId, companyId), sql`${task.data} @> '{"onboarding":true}'::jsonb`));
  return rows
    .map((r) => ({ id: r.id, title: r.title, due: r.due, done: r.doneAt !== null, step: (r.data as { step?: number } | null)?.step ?? 0 }))
    .sort((a, b) => a.step - b.step)
    .map(({ id, title, due, done }) => ({ id, title, due, done }));
}

/** Afkryds/genåbn ét opstartspunkt (PATCH-rute). */
export async function setOnboardingTaskDone(db: Db, companyId: string, taskId: string, done: boolean): Promise<void> {
  const [row] = await db.select({ id: task.id, companyId: task.companyId, data: task.data }).from(task).where(eq(task.id, taskId));
  if (!row || row.companyId !== companyId) throw new OnboardingError("opgaven findes ikke");
  if (!(row.data as { onboarding?: boolean } | null)?.onboarding) throw new OnboardingError("ikke en opstartsopgave");
  await db.update(task).set({ doneAt: done ? new Date() : null }).where(eq(task.id, taskId));
}

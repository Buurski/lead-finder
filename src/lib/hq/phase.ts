// Manuelt faseskift fra profilen (E2E 26/9: der fandtes ingen fasekontrol, og det
// gamle /api/leads/[id]/status loggede intet og nulstillede noter). Fasen udledes
// af lead_status i databasen (trigger 0003), så vi sætter kun lead_status og logger.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";

export class PhaseError extends Error {}

export const PHASES = { ny: "new", interesseret: "interested", tabt: "not-interested", ikke_egnet: "skip" } as const;
export type ManualPhase = keyof typeof PHASES;
const LABEL: Record<ManualPhase, string> = { ny: "aktiv igen", interesseret: "interesseret", tabt: "tabt", ikke_egnet: "ikke egnet" };

/** Returnerer rækkenummeret, så kalderen kan stoppe åbne kolde kladder ved tabt/ikke egnet. */
export async function setPhase(
  db: Db,
  companyId: string,
  phase: unknown,
  actor: string,
): Promise<{ rowNo: number; lifecycle: string; stopDrafts: boolean }> {
  if (typeof phase !== "string" || !Object.hasOwn(PHASES, phase)) throw new PhaseError("ukendt fase");
  const p = phase as ManualPhase;
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(company).where(eq(company.id, companyId)).for("update");
    if (!c) throw new PhaseError("virksomheden findes ikke");
    if (c.clientNo != null) throw new PhaseError(c.clientRemoved ? "tidligere kunde står altid som tabt" : "virksomheden er kunde — fjern kundestatus først");
    const [after] = await tx
      .update(company)
      .set({ leadStatus: PHASES[p], archived: p === "ny" ? false : c.archived, lastUpdated: new Date().toISOString(), updatedAt: new Date() })
      .where(eq(company.id, companyId))
      .returning({ lifecycle: company.lifecycle });
    await tx.insert(activity).values({
      companyId,
      clientName: c.name,
      actor,
      type: "fase",
      summary: `Fase sat til ${LABEL[p]} (var ${c.lifecycle.replace("_", " ")})`,
      payload: { from: c.lifecycle, to: after.lifecycle, leadStatus: PHASES[p] },
    });
    return { rowNo: c.rowNo, lifecycle: after.lifecycle, stopDrafts: p === "tabt" || p === "ikke_egnet" };
  });
}

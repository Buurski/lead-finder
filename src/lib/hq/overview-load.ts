// Server-delen af kundeoverblikket: henter aftalen og ufaktureret arbejde ved
// siden af dossieret og bygger overblikket (ren logik i overview.ts).
import type { Db } from "../db/client.ts";
import type { Dossier } from "./dossier.ts";
import { unbilledWork } from "./billing.ts";
import { buildOverview, type CustomerOverview } from "./overview.ts";
import { canonicalClientName } from "../client-alias.ts";
import { getSubscriptions } from "../invoices.ts";

export async function loadOverview(db: Db, d: Dossier, now = Date.now()): Promise<CustomerOverview> {
  const want = canonicalClientName(d.company.name);
  // Sekventielt: lokalt tåler pglite kun én forbindelse; i prod er det to små opslag.
  const subscription = (await getSubscriptions()).find((s) => canonicalClientName(s.clientName) === want) ?? null;
  const unbilledItems = await unbilledWork(db, d.company.id);
  const unbilled = unbilledItems.reduce((s, i) => s + i.amount, 0);
  return buildOverview(d, { subscription, unbilled, now, unbilledItems });
}

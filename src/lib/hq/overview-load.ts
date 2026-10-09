// Server-delen af kundeoverblikket: henter aftalen og ufaktureret arbejde ved
// siden af dossieret og bygger overblikket (ren logik i overview.ts).
import type { Db } from "../db/client.ts";
import type { Dossier } from "./dossier.ts";
import { unbilledWorkMany } from "./billing.ts";
import { buildOverview, type CustomerOverview } from "./overview.ts";
import { canonicalClientName } from "../client-alias.ts";
import { getSubscriptions } from "../invoices.ts";

export async function loadOverview(db: Db, d: Dossier, now = Date.now()): Promise<CustomerOverview> {
  return (await loadOverviews(db, [d], now))[0];
}

/** Overblik for flere kunder: abonnementer + ufaktureret arbejde hentes ÉN gang, ikke pr. kunde. */
export async function loadOverviews(db: Db, ds: Dossier[], now = Date.now()): Promise<CustomerOverview[]> {
  if (!ds.length) return [];
  // Sekventielt: lokalt tåler pglite kun én forbindelse.
  const subscriptions = await getSubscriptions();
  const unbilledBy = await unbilledWorkMany(db, ds.map((d) => d.company.id));
  return ds.map((d) => {
    const want = canonicalClientName(d.company.name);
    const subscription = subscriptions.find((s) => canonicalClientName(s.clientName) === want) ?? null;
    const unbilledItems = unbilledBy.get(d.company.id) ?? [];
    const unbilled = unbilledItems.reduce((s, i) => s + i.amount, 0);
    return buildOverview(d, { subscription, unbilled, now, unbilledItems });
  });
}

import Link from "next/link";
import { and, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { company } from "@/lib/db/schema";
import { getDossier } from "@/lib/hq/dossier";
import { loadOverview } from "@/lib/hq/overview-load";
import { listRelations } from "@/lib/hq/relations";
import { SERVICES } from "@/lib/hq/overview";
import { copenhagenNow } from "@/lib/settings";
import PageHeader from "@/components/shell/PageHeader";
import CustomerPreview from "@/components/virksomheder/CustomerPreview";
import "@/components/virksomheder/virksomheder.css";

export const dynamic = "force-dynamic";

function domainOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return /^[a-z0-9.-]+$/i.test(url.hostname) && url.hostname.includes(".") ? url.hostname : null;
  } catch { return null; }
}

export default async function KunderPage() {
  const db = getDb();
  const rows = await db.select({ id: company.id, name: company.name, clientNo: company.clientNo })
    .from(company).where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false), eq(company.archived, false)))
    .orderBy(company.name);
  const cards = [];
  const today = copenhagenNow().date;
  for (const row of rows) {
    const dossier = await getDossier(db, row.id, { today });
    if (!dossier) continue;
    const overview = await loadOverview(db, dossier);
    const relations = await listRelations(db, row.id);
    const health = overview.site?.health as { ok?: boolean } | null | undefined;
    cards.push({ ...row, overview, relations, domain: domainOf(overview.site?.domain || dossier.company.website), health: health?.ok });
  }
  return <div className="cc-fade kinly-page kunde-page">
    <PageHeader icon="Building2" title="Kunder" subtitle={`${cards.length} aktive kunder`} />
    {cards.length === 0 ? <div className="cc-card cc-card-pad">Ingen aktive kunder endnu.</div> : <div className="kunde-grid">
      {cards.map((card) => <Link className="cc-card kunde-card cc-focus" href={`/virksomheder/${card.id}`} key={card.id}>
        <CustomerPreview domain={card.domain} name={card.name} />
        <div className="kunde-card-content">
          <div className="kunde-card-heading"><h2>{card.name || "(uden navn)"}</h2><span>Kunde #{card.clientNo}</span></div>
          <div className="kunde-card-services">{card.overview.services.map((service) => <span className="cc-chip" key={service}>{SERVICES[service] || service}</span>)}</div>
          <p className="kunde-card-now" data-level={card.overview.attention[0]?.level ?? undefined}>Lige nu: {card.overview.attention[0]?.text || "Intet der haster."}</p>
          {card.relations.length > 0 && <p className="kunde-card-relations">Hænger sammen med {card.relations.map((r) => r.name).join(", ")}</p>}
          <div className="kunde-card-footer"><span>MRR <b>{card.overview.money.plan?.perMonth ? `${card.overview.money.plan.perMonth.toLocaleString("da-DK")} kr` : "–"}</b></span><span>Skylder <b>{card.overview.money.unpaid ? `${card.overview.money.unpaid.toLocaleString("da-DK")} kr` : "–"}</b></span><span className="kunde-health" data-state={card.health === true ? "ok" : card.health === false ? "down" : "unknown"}><i />{card.health === true ? "Site OK" : card.health === false ? "Site nede" : "Ikke tjekket"}</span></div>
        </div>
      </Link>)}
    </div>}
  </div>;
}

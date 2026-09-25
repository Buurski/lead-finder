import Link from "next/link";
import { and, count, desc, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { company } from "@/lib/db/schema";
import { getDossier } from "@/lib/hq/dossier";
import { loadOverview } from "@/lib/hq/overview-load";
import { listRelations } from "@/lib/hq/relations";
import { SERVICES } from "@/lib/hq/overview";
import { copenhagenNow } from "@/lib/settings";
import PageHeader from "@/components/shell/PageHeader";
import CustomerPreview from "@/components/virksomheder/CustomerPreview";
import { lifecycleChipStyle, lifecycleLabel } from "@/components/virksomheder/lifecycle";
import "@/components/virksomheder/virksomheder.css";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 60;

// Fanerne er livsfaser. "Ikke egnet" tæller også arkiverede — leads.ts arkiverer ved ikke_egnet.
const TABS = [
  { key: "kunder", label: "Kunder" },
  { key: "varme", label: "Varme", phases: ["interesseret", "svaret"] },
  { key: "leads", label: "Leads", phases: ["ny", "kontaktet"] },
  { key: "ikke-egnet", label: "Ikke egnet", phases: ["ikke_egnet", "tabt"], includeArchived: true },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const isCustomer = and(isNotNull(company.clientNo), eq(company.clientRemoved, false));
const notCustomer = or(isNull(company.clientNo), eq(company.clientRemoved, true));

function whereFor(key: TabKey) {
  const tab = TABS.find((t) => t.key === key)!;
  if (!("phases" in tab)) return and(isCustomer, eq(company.archived, false));
  const phase = and(notCustomer, inArray(company.lifecycle, [...tab.phases]));
  return "includeArchived" in tab ? phase : and(phase, eq(company.archived, false));
}

function domainOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.toLowerCase();
    // Sociale profiler er ikke en hjemmeside — et skud af dem er en login-skærm.
    if (/(^|\.)(facebook|fb|instagram|linkedin|tiktok|google|goo)\.[a-z]+$/.test(host)) return null;
    return /^[a-z0-9.-]+$/.test(host) && host.includes(".") ? host : null;
  } catch { return null; }
}

export default async function KunderPage({ searchParams }: { searchParams: Promise<{ fane?: string; side?: string }> }) {
  const sp = await searchParams;
  const fane: TabKey = TABS.some((t) => t.key === sp.fane) ? (sp.fane as TabKey) : "kunder";
  const side = Math.max(1, Number.parseInt(sp.side ?? "1", 10) || 1);
  const db = getDb();

  const counts = await Promise.all(TABS.map(async (t) => (await db.select({ n: count() }).from(company).where(whereFor(t.key)))[0]?.n ?? 0));
  const total = counts[TABS.findIndex((t) => t.key === fane)];

  const nav = <nav className="virk-chips kunde-tabs" aria-label="Vælg liste">
    {TABS.map((t, i) => <Link key={t.key} href={t.key === "kunder" ? "/kunder" : `/kunder?fane=${t.key}`} className="virk-chip" aria-current={fane === t.key ? "true" : undefined}>
      {t.label} <span className="virk-chip-n">{counts[i]}</span>
    </Link>)}
  </nav>;

  return <div className="cc-fade kinly-page kunde-page">
    <PageHeader icon="Building2" title="Kunder" subtitle={`${counts[0]} aktive kunder · ${counts[1]} varme`} />
    {nav}
    {fane === "kunder" ? <CustomerCards /> : <CompanyCards fane={fane} side={side} total={total} />}
  </div>;
}

async function CustomerCards() {
  const db = getDb();
  const rows = await db.select({ id: company.id, name: company.name, clientNo: company.clientNo })
    .from(company).where(whereFor("kunder")).orderBy(company.name);
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
  if (cards.length === 0) return <div className="cc-card cc-card-pad">Ingen aktive kunder endnu.</div>;
  return <div className="kunde-grid">
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
  </div>;
}

// Lette kort for ikke-kunder: ingen dossier-opslag pr. kort (1400+ rækker).
async function CompanyCards({ fane, side, total }: { fane: TabKey; side: number; total: number }) {
  const rows = await getDb().select({
    id: company.id, name: company.name, branch: company.branch, city: company.city, website: company.website,
    lifecycle: company.lifecycle, jevGrade: company.jevGrade, emailSentAt: company.emailSentAt, skipReason: company.skipReason,
  }).from(company).where(whereFor(fane))
    // Varme: senest rørt først. Leads: bedste Jev-score først.
    .orderBy(...(fane === "leads" ? [sql`${company.jevScore} desc nulls last`, desc(company.score)] : [desc(company.updatedAt)]))
    .limit(PAGE_SIZE).offset((side - 1) * PAGE_SIZE);

  if (rows.length === 0) return <div className="cc-card cc-card-pad">Ingen virksomheder her.</div>;
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = (n: number) => `/kunder?fane=${fane}${n > 1 ? `&side=${n}` : ""}`;
  return <>
    <div className="kunde-grid">
      {rows.map((r) => <Link className="cc-card kunde-card cc-focus" href={`/virksomheder/${r.id}`} key={r.id}>
        <CustomerPreview domain={domainOf(r.website)} name={r.name} />
        <div className="kunde-card-content">
          <div className="kunde-card-heading"><h2>{r.name || "(uden navn)"}</h2>{r.jevGrade && <span>Jev {r.jevGrade}</span>}</div>
          <p className="kunde-card-relations">{[r.branch, r.city].filter(Boolean).join(" · ") || "Ukendt branche"}</p>
          <div className="kunde-card-footer">
            <span className="cc-chip" style={lifecycleChipStyle(r.lifecycle)}>{lifecycleLabel(r.lifecycle)}</span>
            <span>{r.emailSentAt ? `Mailet ${r.emailSentAt.slice(0, 10)}` : fane === "ikke-egnet" && r.skipReason ? r.skipReason : "Ikke kontaktet"}</span>
          </div>
        </div>
      </Link>)}
    </div>
    {lastPage > 1 && <nav className="virk-chips" aria-label="Sider">
      {side > 1 && <Link className="virk-chip" href={page(side - 1)}>← Forrige</Link>}
      <span className="virk-chip" aria-current="true">Side {side} af {lastPage}</span>
      {side < lastPage && <Link className="virk-chip" href={page(side + 1)}>Næste →</Link>}
    </nav>}
  </>;
}

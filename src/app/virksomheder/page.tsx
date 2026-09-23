import Link from "next/link";
import { and, desc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activity, company } from "@/lib/db/schema";
import { getDossier } from "@/lib/hq/dossier";
import { loadOverview } from "@/lib/hq/overview-load";
import { copenhagenNow } from "@/lib/settings";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import { lifecycleChipStyle, lifecycleLabel } from "@/components/virksomheder/lifecycle";
import "@/components/virksomheder/virksomheder.css";

const kr = (n: number) => `${n.toLocaleString("da-DK")} kr`;

// Kort til "Kunder"-fanen: hvad kræver noget lige nu, MRR og hvad de skylder.
// Kun kaldt for kunde-filtret (få stk.) — sekventielt, lokal pglite tåler kun
// 1 samtidig forbindelse (fælles-regel #23).
interface CustomerCard { id: string; name: string; city: string | null; branch: string | null; attention: string | null; level: "haster" | "obs" | null; mrr: number; unpaid: number }

async function loadCustomerCards(db: ReturnType<typeof getDb>, rows: Array<{ id: string; name: string; city: string | null; branch: string | null }>): Promise<CustomerCard[]> {
  const today = copenhagenNow().date;
  const cards: CustomerCard[] = [];
  for (const r of rows) {
    const dossier = await getDossier(db, r.id, { today });
    if (!dossier) continue;
    const overview = await loadOverview(db, dossier);
    cards.push({
      id: r.id,
      name: r.name,
      city: r.city,
      branch: r.branch,
      attention: overview.attention[0]?.text ?? null,
      level: overview.attention[0]?.level ?? null,
      mrr: overview.money.plan?.perMonth ?? 0,
      unpaid: overview.money.unpaid,
    });
  }
  return cards;
}

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const TABT_KEY = "tabt_ikke_egnet";
const FASE_KEYS = ["ny", "kontaktet", "svaret", "interesseret", "kunde"] as const;

function escapeLike(q: string): string {
  return q.replace(/[%_\\]/g, "\\$&");
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min siden`;
  const t = Math.round(min / 60);
  if (t < 24) return `${t} t siden`;
  const d = Math.round(t / 24);
  if (d < 30) return `${d} d siden`;
  return new Date(iso).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });
}

interface SearchParams {
  q?: string;
  fase?: string;
  kunder?: string;
  ejer?: string;
  side?: string;
}

export default async function VirksomhederPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 120);
  const wantKunder = sp.kunder === "1";
  const fase = (sp.fase ?? "").trim();
  const ejer = sp.ejer === "lucas" || sp.ejer === "charlie" ? sp.ejer : "";
  const side = Math.max(1, parseInt(sp.side ?? "1", 10) || 1);

  const db = getDb();
  const pattern = q ? `%${escapeLike(q)}%` : "";
  const qFilter = q ? or(ilike(company.name, pattern), ilike(company.city, pattern), ilike(company.email, pattern)) : undefined;
  const kunderFilter = and(isNotNull(company.clientNo), eq(company.clientRemoved, false));

  const faseFilter =
    fase === TABT_KEY
      ? or(eq(company.lifecycle, "tabt"), eq(company.lifecycle, "ikke_egnet"))
      : (FASE_KEYS as readonly string[]).includes(fase)
        ? eq(company.lifecycle, fase)
        : undefined;

  const where = and(
    eq(company.archived, false),
    qFilter,
    ejer ? eq(company.owner, ejer) : undefined,
    wantKunder ? kunderFilter : undefined,
    !wantKunder ? faseFilter : undefined,
  );

  // Tal til fanerne regnes af samme søgning (q + ejer), men uden fase/kunder-filter,
  // så man kan se hvor mange der er i hver fane uanset hvilken der er valgt.
  const countBase = and(eq(company.archived, false), qFilter, ejer ? eq(company.owner, ejer) : undefined);

  // Sekventielle kald, ikke Promise.all: den lokale pglite-server tillader kun
  // 1 samtidig forbindelse (fælles-regel #19) — parallelle kald her gav
  // ECONNRESET. Rammer ikke Neon i prod (samme pool, bare ingen kø lokalt).
  const rows = await db
    .select({
      id: company.id,
      name: company.name,
      city: company.city,
      branch: company.branch,
      lifecycle: company.lifecycle,
      jevGrade: company.jevGrade,
      clientNo: company.clientNo,
      updatedAt: company.updatedAt,
    })
    .from(company)
    .where(where)
    .orderBy(sql`case when ${company.clientNo} is not null and ${company.clientRemoved} = false then 0 else 1 end`, desc(company.updatedAt))
    .limit(PAGE_SIZE)
    .offset((side - 1) * PAGE_SIZE);
  // Rækkens tidsstempel skal være seneste RIGTIGE aktivitet, ikke company.updatedAt
  // (den rammes af bulk-import og scoring-crons — så viser "16 t siden" på næsten
  // alle rækker uden det betyder noget skete). max(activity.at) pr. virksomhed;
  // ingen aktivitet ⇒ intet tidsstempel i stedet for et misvisende ét.
  const rowIds = rows.map((r) => r.id);
  const lastActivityRows = rowIds.length
    ? await db.select({ companyId: activity.companyId, at: sql<string>`max(${activity.at})` })
        .from(activity).where(inArray(activity.companyId, rowIds)).groupBy(activity.companyId)
    : [];
  const lastActivityAt = new Map(lastActivityRows.filter((r) => r.companyId).map((r) => [r.companyId as string, r.at]));

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(company).where(where);
  const lifecycleCounts = await db.select({ lifecycle: company.lifecycle, n: sql<number>`count(*)::int` }).from(company).where(countBase).groupBy(company.lifecycle);
  const [{ kunderTotal }] = await db.select({ kunderTotal: sql<number>`count(*)::int` }).from(company).where(and(countBase, kunderFilter));

  const countsByLifecycle = new Map(lifecycleCounts.map((r) => [r.lifecycle, r.n]));
  const [{ total: alleTotal }] = await db.select({ total: sql<number>`count(*)::int` }).from(company).where(countBase);
  const tabtCount = (countsByLifecycle.get("tabt") ?? 0) + (countsByLifecycle.get("ikke_egnet") ?? 0);

  // Kunder-fanen: kort i stedet for rækker, så det ses hvem der kræver noget (Lucas 23/9).
  const customerCards = wantKunder ? await loadCustomerCards(db, rows) : null;

  function href(overrides: { fase?: string; kunder?: string }): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (ejer) params.set("ejer", ejer);
    if (overrides.fase) params.set("fase", overrides.fase);
    if (overrides.kunder) params.set("kunder", overrides.kunder);
    const s = params.toString();
    return `/virksomheder${s ? `?${s}` : ""}`;
  }

  function pageHref(n: number): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (ejer) params.set("ejer", ejer);
    if (wantKunder) params.set("kunder", "1");
    else if (fase) params.set("fase", fase);
    if (n > 1) params.set("side", String(n));
    const s = params.toString();
    return `/virksomheder${s ? `?${s}` : ""}`;
  }

  const chips: { key: string; label: string; n: number; overrides: { fase?: string; kunder?: string } }[] = [
    { key: "alle", label: "Alle", n: alleTotal, overrides: {} },
    { key: "kunder", label: "Kunder", n: kunderTotal, overrides: { kunder: "1" } },
    { key: "interesseret", label: "Interesseret", n: countsByLifecycle.get("interesseret") ?? 0, overrides: { fase: "interesseret" } },
    { key: "svaret", label: "Svaret", n: countsByLifecycle.get("svaret") ?? 0, overrides: { fase: "svaret" } },
    { key: "kontaktet", label: "Kontaktet", n: countsByLifecycle.get("kontaktet") ?? 0, overrides: { fase: "kontaktet" } },
    { key: "ny", label: "Ny", n: countsByLifecycle.get("ny") ?? 0, overrides: { fase: "ny" } },
    { key: "tabt", label: "Tabt/ikke egnet", n: tabtCount, overrides: { fase: TABT_KEY } },
  ];
  const activeChip = wantKunder ? "kunder" : fase === TABT_KEY ? "tabt" : (FASE_KEYS as readonly string[]).includes(fase) ? fase : "alle";

  const from = total === 0 ? 0 : (side - 1) * PAGE_SIZE + 1;
  const to = Math.min(side * PAGE_SIZE, total);
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="cc-fade kinly-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader icon="Building2" title="Alle virksomheder" subtitle={`${alleTotal} virksomheder${ejer ? ` · ejer: ${ejer}` : ""}`} />

      <form action="/virksomheder" method="get" className="virk-search" role="search">
        <input type="search" name="q" defaultValue={q} placeholder="Søg på navn, by eller mail…" aria-label="Søg virksomheder" />
        {ejer && <input type="hidden" name="ejer" value={ejer} />}
        <button type="submit" className="cc-btn virk-btn-press">Søg</button>
      </form>

      <nav className="virk-chips" aria-label="Filtrér på livsfase">
        {chips.map((c) => (
          <Link key={c.key} href={href(c.overrides)} className="virk-chip" aria-current={activeChip === c.key ? "true" : undefined}>
            {c.label} <span className="virk-chip-n">{c.n}</span>
          </Link>
        ))}
      </nav>

      {customerCards ? (
        customerCards.length === 0 ? (
          <div className="cc-card">
            <div className="cc-empty">
              <Icon name="Building2" />
              {q ? "Ingen kunder matcher søgningen." : "Ingen kunder endnu."}
            </div>
          </div>
        ) : (
          <div className="ov-card-grid">
            {customerCards.map((c) => (
              <Link key={c.id} href={`/virksomheder/${c.id}`} className="cc-card cc-card-pad ov-card cc-focus">
                <div className="ov-card-top">
                  <span className="ov-card-name">{c.name || "(uden navn)"}</span>
                </div>
                <span className="cc-dim" style={{ fontSize: 12 }}>{[c.city, c.branch].filter(Boolean).join(" · ") || "–"}</span>
                <span className="ov-card-attention" data-level={c.level ?? undefined}>{c.attention ?? "Intet der haster."}</span>
                <div className="ov-card-nums">
                  <span>MRR <b>{c.mrr > 0 ? kr(c.mrr) : "–"}</b></span>
                  <span>Skylder <b style={c.unpaid > 0 ? { color: "var(--red)" } : undefined}>{c.unpaid > 0 ? kr(c.unpaid) : "–"}</b></span>
                </div>
              </Link>
            ))}
          </div>
        )
      ) : (
      <div className="cc-card">
        {rows.length === 0 ? (
          <div className="cc-empty">
            <Icon name="Building2" />
            {q || fase ? "Ingen virksomheder matcher filtret." : "Ingen virksomheder endnu."}
          </div>
        ) : (
          <ul className="virk-list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {rows.map((r) => (
              <li key={r.id}>
                <Link href={`/virksomheder/${r.id}`} className="virk-row cc-focus">
                  <div className="virk-row-inner">
                    <div style={{ minWidth: 0 }}>
                      <div className="virk-row-name">{r.name || "(uden navn)"}</div>
                      {r.clientNo !== null && <div className="virk-row-sub">Kunde #{r.clientNo}</div>}
                    </div>
                    <div className="virk-row-branch">{[r.city, r.branch].filter(Boolean).join(" · ") || "–"}</div>
                    <span className="cc-chip" style={{ ...lifecycleChipStyle(r.lifecycle), whiteSpace: "nowrap" }}>{lifecycleLabel(r.lifecycle)}</span>
                    {r.jevGrade ? <span className="cc-chip" style={{ background: "var(--bg-3)", color: "var(--text-muted)" }}>Jev {r.jevGrade}</span> : <span />}
                    <span className="virk-row-updated">{lastActivityAt.has(r.id) ? relTime(lastActivityAt.get(r.id)!) : ""}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      )}

      {total > PAGE_SIZE && (
        <div className="virk-pagination">
          <span className="virk-pagination-meta">{from}–{to} af {total}</span>
          <div style={{ display: "flex", gap: 8 }}>
            {side <= 1 ? (
              <span className="cc-btn" aria-disabled="true" style={{ opacity: 0.4, cursor: "default" }}>Forrige</span>
            ) : (
              <Link href={pageHref(side - 1)} className="cc-btn virk-btn-press">Forrige</Link>
            )}
            {side >= lastPage ? (
              <span className="cc-btn" aria-disabled="true" style={{ opacity: 0.4, cursor: "default" }}>Næste</span>
            ) : (
              <Link href={pageHref(side + 1)} className="cc-btn virk-btn-press">Næste</Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

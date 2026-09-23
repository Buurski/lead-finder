import Link from "next/link";
import { and, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { company } from "@/lib/db/schema";
import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import { lifecycleChipStyle, lifecycleLabel } from "@/components/virksomheder/lifecycle";
import "@/components/virksomheder/virksomheder.css";

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

  const [rows, [{ total }], lifecycleCounts, [{ kunderTotal }]] = await Promise.all([
    db
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
      .offset((side - 1) * PAGE_SIZE),
    db.select({ total: sql<number>`count(*)::int` }).from(company).where(where),
    db.select({ lifecycle: company.lifecycle, n: sql<number>`count(*)::int` }).from(company).where(countBase).groupBy(company.lifecycle),
    db.select({ kunderTotal: sql<number>`count(*)::int` }).from(company).where(and(countBase, kunderFilter)),
  ]);

  const countsByLifecycle = new Map(lifecycleCounts.map((r) => [r.lifecycle, r.n]));
  const [{ total: alleTotal }] = await db.select({ total: sql<number>`count(*)::int` }).from(company).where(countBase);
  const tabtCount = (countsByLifecycle.get("tabt") ?? 0) + (countsByLifecycle.get("ikke_egnet") ?? 0);

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
      <PageHeader icon="Building2" title="Virksomheder" subtitle={`${alleTotal} virksomheder${ejer ? ` · ejer: ${ejer}` : ""}`} />

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

      <div className="cc-card">
        {rows.length === 0 ? (
          <div className="cc-empty">
            <Icon name="Building2" />
            {q || fase || wantKunder ? "Ingen virksomheder matcher filtret." : "Ingen virksomheder endnu."}
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
                    <span className="virk-row-updated">{relTime(r.updatedAt.toISOString())}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

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

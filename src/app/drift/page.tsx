import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import Link from "next/link";
import { hermesKanban, hermesCronList, hermesCronRuns } from "@/lib/hermes";
import type { HermesKanbanCard } from "@/lib/hermes-client";

// Drift & OS — read-only spejl af Hermes' kanban + cron (samme tal som OS-boardet).
// Kilden er hermes-api på VPS'en (/api/kanban + /api/cron); ingen writes herfra.
export const dynamic = "force-dynamic";
export const metadata = { title: "Drift & OS · Kinly Lead System" };

const STATUS_DA: Record<string, string> = {
  running: "arbejder",
  ready: "i kø",
  todo: "i kø",
  triage: "i kø",
  blocked: "venter på dig",
  done: "færdig",
  completed: "færdig",
  failed: "gik galt",
  crashed: "gik galt",
  timed_out: "tog for lang tid",
  archived: "lagt væk",
  cancelled: "afbrudt",
};

const PROFILE_DA: Record<string, string> = {
  cofounder: "Co-founderen",
  marketing: "Marketing",
  kundeplejer: "Kundeplejeren",
  default: "Hermes",
  lucas: "Lucas",
};

function firstMeaningful(excerpt: string | null | undefined): string {
  const lines = (excerpt ?? "")
    .split("\n")
    .map((l) => l.replace(/^[#>*\-\s]+/, "").trim())
    .filter((l) => l && !l.startsWith("```") && l !== "---");
  return (lines.slice(0, 2).join(" ") || "").slice(0, 200);
}

function da(status: string | null | undefined): string {
  if (!status) return "ukendt";
  return STATUS_DA[status] ?? status;
}

function rel(iso: string | null | undefined): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = Math.round((Date.now() - t) / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} t`;
  return `${Math.round(h / 24)} d`;
}

function CardRow({ card, tone }: { card: HermesKanbanCard; tone?: "amber" | "muted" }) {
  return (
    <li className="kinly-drift-row">
      <span className="kinly-drift-dot" data-tone={tone ?? "muted"} aria-hidden />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{card.title}</div>
        <div className="cc-dim" style={{ fontSize: 11.5 }}>
          {PROFILE_DA[card.assignee ?? "default"] ?? card.assignee} · {da(card.status)}
          {card.createdAt ? ` · oprettet for ${rel(card.createdAt)} siden` : ""}
        </div>
      </div>
    </li>
  );
}

export default async function DriftPage() {
  const [kanban, jobs, runsByJob] = await Promise.all([
    hermesKanban().catch(() => null),
    hermesCronList().catch(() => []),
    hermesCronRuns(2).catch(() => []),
  ]);

  // "Hvad har agenterne lavet": nyeste kørsler på tværs af jobs, med et uddrag af
  // rapporten (første meningsfulde linje) — så man ikke skal ind i Hermes.
  const recentRuns = runsByJob
    .flatMap((j) => (j.runs ?? []).map((r) => ({ job: j.name ?? j.id, ...r })))
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, 10);

  const blocked = kanban?.blocked ?? [];
  const active = kanban?.active ?? [];
  const counts = kanban?.counts ?? {};
  const perPerson = Object.entries(kanban?.perPerson ?? {}).sort((a, b) => b[1] - a[1]);

  const enabled = jobs.filter((j) => j.enabled !== false && j.state !== "paused");
  const failing = enabled.filter((j) => j.last_status && j.last_status !== "ok");
  const pausedCount = jobs.length - enabled.length;

  const kpis = [
    { label: "Venter på dig", value: blocked.length, href: "#venter", tone: blocked.length ? "sand" : "sage" },
    { label: "I arbejde", value: active.length, href: "#arbejde", tone: "sky" },
    { label: "Færdige 7 dage", value: kanban?.doneLast7d ?? 0, href: "#", tone: "sage" },
    { label: "Jobs der fejler", value: failing.length, href: "#cron", tone: failing.length ? "clay" : "sage" },
  ];

  return (
    <div className="cc-fade kinly-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        icon="Activity"
        title="Drift & OS"
        subtitle="Kanban, cron og agenter — samme tal som OS-boardet på VPS'en. Læs kun; handlinger sker i Hermes."
      />

      {!kanban?.ok && (
        <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <Icon name="Activity" style={{ width: 17, height: 17, color: "var(--amber)" }} />
          <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
            Kanban kunne ikke nås lige nu ({kanban?.note ?? "VPS svarede ikke"}). Tallene nedenfor er fra cachen hvor den findes.
          </span>
        </div>
      )}

      <section className="kinly-kpi-rail" aria-label="OS-status">
        {kpis.map((k) => (
          <a key={k.label} href={k.href} className="kinly-kpi" data-tone={k.tone}>
            <span>{k.label}</span>
            <strong>{k.value.toLocaleString("da-DK")}</strong>
            <small>{kanban?.generatedAt ? `opdateret for ${rel(kanban.generatedAt)} siden` : "kanban"}</small>
          </a>
        ))}
      </section>

      <div className="kinly-control-grid">
        <main className="kinly-control-main">
          <section className="cc-card" id="venter" aria-label="Venter på dig">
            <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: blocked.length ? "1px solid var(--border)" : "none" }}>
              <Icon name="Clock" style={{ width: 17, height: 17, color: "var(--amber)" }} />
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Venter på dig</h2>
              <span className="cc-chip" style={{ marginLeft: "auto" }}>{blocked.length}</span>
            </div>
            {blocked.length === 0 ? (
              <div className="cc-empty"><Icon name="CheckCheck" /><div>Intet blokeret. Agenterne kører selv.</div></div>
            ) : (
              <ul className="kinly-drift-list">{blocked.map((c) => <CardRow key={c.id} card={c} tone="amber" />)}</ul>
            )}
          </section>

          <section className="cc-card" id="arbejde" aria-label="I arbejde">
            <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: active.length ? "1px solid var(--border)" : "none" }}>
              <Icon name="Workflow" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>I arbejde</h2>
              <span className="cc-chip" style={{ marginLeft: "auto" }}>{active.length}</span>
            </div>
            {active.length === 0 ? (
              <div className="cc-empty"><Icon name="Workflow" /><div>Ingen kort i kø lige nu.</div></div>
            ) : (
              <ul className="kinly-drift-list">{active.map((c) => <CardRow key={c.id} card={c} />)}</ul>
            )}
          </section>

          <section className="cc-card" id="korsler" aria-label="Hvad agenterne har lavet">
            <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: recentRuns.length ? "1px solid var(--border)" : "none" }}>
              <Icon name="FileText" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Hvad agenterne har lavet</h2>
              <span className="cc-chip" style={{ marginLeft: "auto" }}>{recentRuns.length ? `seneste ${recentRuns.length}` : "ingen kørsler"}</span>
            </div>
            {recentRuns.length === 0 ? (
              <div className="cc-empty"><Icon name="FileText" /><div>Ingen rapporter fundet endnu.</div></div>
            ) : (
              <ul className="kinly-drift-list">
                {recentRuns.map((r) => (
                  <li key={`${r.job}-${r.file}`} className="kinly-drift-row" style={{ alignItems: "flex-start" }}>
                    <span className="kinly-drift-dot" data-tone={r.status === "error" ? "amber" : "ok"} style={{ marginTop: 6 }} aria-hidden />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.job}</div>
                      <div className="cc-dim" style={{ fontSize: 11.5 }}>
                        {String(r.timestamp).replace(/-/g, ":").replace(":", " ").slice(0, 16)}
                        {r.status === "error" ? " · fejlede" : ""}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{firstMeaningful(r.excerpt)}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cc-card" id="cron" aria-label="Cron-jobs">
            <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--border)" }}>
              <Icon name="Calendar" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
              <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Cron på VPS&apos;en</h2>
              <span className="cc-chip" style={{ marginLeft: "auto" }}>{enabled.length} aktive · {pausedCount} pauset</span>
            </div>
            {failing.length > 0 && (
              <div style={{ padding: "10px 22px", background: "var(--amber-dim)", borderBottom: "1px solid var(--border)", fontSize: 12.5, color: "var(--amber)" }}>
                {failing.length} {failing.length === 1 ? "job" : "jobs"} med fejl i seneste kørsel: {failing.slice(0, 4).map((j) => j.name).join(", ")}
                {failing.length > 4 ? " …" : ""}
              </div>
            )}
            <ul className="kinly-drift-list">
              {enabled.slice(0, 14).map((j) => (
                <li key={j.id} className="kinly-drift-row">
                  <span className="kinly-drift-dot" data-tone={j.last_status && j.last_status !== "ok" ? "amber" : "ok"} aria-hidden />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{j.name}</div>
                    <div className="cc-dim" style={{ fontSize: 11.5 }}>
                      {j.schedule_display ?? ""}
                      {j.last_run_at ? ` · sidst for ${rel(j.last_run_at)} siden` : " · ikke kørt endnu"}
                      {j.next_run_at ? ` · næste ${new Date(j.next_run_at).toLocaleString("da-DK", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                    </div>
                  </div>
                  <span className="cc-chip" style={{ background: j.last_status && j.last_status !== "ok" ? "var(--red-dim)" : "var(--accent-soft)" }}>
                    {j.last_status ?? "klar"}
                  </span>
                </li>
              ))}
            </ul>
            {enabled.length > 14 && (
              <div className="cc-card-pad cc-dim" style={{ fontSize: 12 }}>
                + {enabled.length - 14} flere aktive jobs — se dem alle i Hermes.
              </div>
            )}
          </section>
        </main>

        <aside className="kinly-decision-panel" aria-label="Agenter og kilder">
          <div className="kinly-decision-kicker"><Icon name="Sparkles" /> Agenterne</div>
          <div className="kinly-source-list" style={{ marginTop: 14 }}>
            <h3>Kort i arbejde pr. agent</h3>
            {perPerson.length === 0 ? (
              <div className="kinly-source-row"><span className="kinly-source-state" data-state="live" aria-hidden /><span>Ingen aktive kort</span><small>—</small></div>
            ) : (
              perPerson.map(([who, n]) => (
                <div key={who} className="kinly-source-row">
                  <span className="kinly-source-state" data-state="live" aria-hidden />
                  <span>{PROFILE_DA[who] ?? who}</span>
                  <small>{n} kort</small>
                </div>
              ))
            )}
          </div>

          <div className="kinly-source-list">
            <h3>Samlet</h3>
            <div className="kinly-source-row"><span className="kinly-source-state" data-state="live" aria-hidden /><span>Kort i alt</span><small>{kanban?.total?.toLocaleString("da-DK") ?? "—"}</small></div>
            <div className="kinly-source-row"><span className="kinly-source-state" data-state="live" aria-hidden /><span>Færdige</span><small>{(counts.done ?? 0).toLocaleString("da-DK")}</small></div>
            <div className="kinly-source-row"><span className="kinly-source-state" data-state="live" aria-hidden /><span>Arkiveret</span><small>{(counts.archived ?? 0).toLocaleString("da-DK")}</small></div>
          </div>

          <div className="kinly-panel-foot">
            <span>{kanban?.generatedAt ? `kanban læst for ${rel(kanban.generatedAt)} siden` : "kanban ikke læst"}</span>
            <strong>Kilde: kanban.db + jobs.json</strong>
          </div>

          <Link href="/hermes" className="kinly-decision-action" style={{ marginTop: 16 }}>
            Åbn Hermes <Icon name="ArrowRight" />
          </Link>
        </aside>
      </div>
    </div>
  );
}

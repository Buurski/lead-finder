"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";
import MarkdownLite from "@/components/shell/MarkdownLite";
import EngineRunner from "./EngineRunner";
import FindEmailsButton from "./FindEmailsButton";
import UsageSparkline from "./UsageSparkline";
import type { DeckSummary, NeedsYouItem } from "@/lib/deck";
import { buildValueChain, controlStatus, nextAction } from "@/lib/next-action";
import type { SpendSummary } from "@/lib/spend-log";
import { businessLoopState, describeUsageChange, formatTokenCount, type HermesUsageSummary, type HermesKanbanSummary, type SynlighedSnapshot } from "@/lib/hermes-client";

// Today's brief from the Obsidian vault (daily/<date>.md). Built server-side in
// page.tsx and passed down so the "Hvad skal vi i dag" hub can lead with it.
export interface DailyBrief {
  ok: boolean;
  date: string;
  title: string;
  body: string;
  source: string;
  pathRel: string;
}

type Tab = "today" | "pipeline" | "goals" | "agents";

const TABS: { id: Tab; label: string; short: string }[] = [
  { id: "today", label: "I dag", short: "I dag" },
  { id: "pipeline", label: "Pipeline", short: "Pipeline" },
  { id: "goals", label: "Mål & indtjening", short: "Mål" },
  { id: "agents", label: "Agenter", short: "Agenter" },
];

function TabNav({ tab, setTab, secondary }: { tab: Tab; setTab: (t: Tab) => void; secondary?: boolean }) {
  return (
    <div className="cc-tabs cc-tabs-scroll" role="tablist" aria-label="Mission Control faner" style={secondary ? { alignSelf: "center" } : undefined}>
      {TABS.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={tab === t.id}
          data-active={tab === t.id}
          className="cc-tab"
          onClick={() => setTab(t.id)}
        >
          <span className="cc-tab-full">{t.label}</span>
          <span className="cc-tab-short">{t.short}</span>
        </button>
      ))}
    </div>
  );
}

export type OsData = { kanban: HermesKanbanSummary | null; synlighed: SynlighedSnapshot | null };

export default function MissionControl({ summary, cadence, spendAlert, spend, dailyBrief, hermesUsage, os }: { summary: DeckSummary; cadence?: string | null; spendAlert?: string | null; spend?: SpendSummary | null; dailyBrief?: DailyBrief | null; hermesUsage?: HermesUsageSummary | null; os?: OsData | null }) {
  const [tab, setTab] = useState<Tab>("today");
  const [details, setDetails] = useState(false);

  // Closing details returns to the Today view so the extra tabs never linger.
  function toggleDetails() {
    setDetails((d) => {
      if (d) setTab("today");
      return !d;
    });
  }

  return (
    <div className="cc-fade kinly-page" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <header className="kinly-page-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="cc-h1">Overblik.</h1>
          <p className="cc-sub">{summaryLine(summary)}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            onClick={toggleDetails}
            aria-expanded={details}
            className="cc-card kinly-quiet-action"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "9px 13px", cursor: "pointer", background: "transparent", color: "var(--text-dim)", fontWeight: 600, fontSize: 12.5, font: "inherit" }}
          >
            Detaljer
            <Icon name={details ? "ChevronUp" : "ChevronDown"} style={{ width: 14, height: 14 }} />
          </button>
        </div>
      </header>

      {/* Pipeline / Goals / Agents are detail views — hidden until asked for. */}
      {details && <TabNav tab={tab} setTab={setTab} secondary />}


      {spendAlert && (
        <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--amber)" }}>
          <Icon name="CircleDollarSign" style={{ width: 17, height: 17, color: "var(--amber)" }} />
          <span style={{ fontSize: 13.5 }}>{spendAlert} — over dagsgrænsen. Åbn Detaljer → Agents for tallene.</span>
        </div>
      )}

      {tab === "today" && <TodayTab s={summary} dailyBrief={dailyBrief ?? null} usage={hermesUsage ?? null} os={os ?? null} />}
      {tab === "pipeline" && <PipelineTab s={summary} cadence={cadence} />}
      {tab === "goals" && <GoalsTab s={summary} />}
      {tab === "agents" && <AgentsTab s={summary} spend={spend ?? null} usage={hermesUsage ?? null} />}
    </div>
  );
}

// Day-at-a-glance one-liner: only the two numbers that drive the day —
// drafts waiting for approval and replies waiting for an answer.
function summaryLine(s: DeckSummary): string {
  if (!s.ok) return "Kun lokale kødata vises, indtil Google Sheets svarer igen.";
  const bits: string[] = [];
  if (s.queue.pending) bits.push(`${s.queue.pending} udkast venter`);
  if (s.numbers.repliesPending) bits.push(`${s.numbers.repliesPending} svar venter`);
  if (!bits.length) return "Alt er roligt. Intet kræver dig lige nu.";
  return bits.join(" · ");
}

/* ------------------------------------------------------------------ */
/* TODAY                                                               */
/* ------------------------------------------------------------------ */
function TodayTab({ s, dailyBrief, usage, os }: { s: DeckSummary; dailyBrief: DailyBrief | null; usage: HermesUsageSummary | null; os: OsData | null }) {
  const router = useRouter();
  const [sel, setSel] = useState(0);
  const n = s.needsYou.length;

  // Keyboard-first triage on the Morning Coffee list: j/k or ↑/↓ to move,
  // Enter opens. Ignored while typing or when the ⌘K palette owns the keys.
  useEffect(() => {
    if (n === 0) return;
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (document.querySelector(".cc-palette")) return;
      const k = e.key.toLowerCase();
      if (k === "j" || e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, n - 1)); }
      else if (k === "k" || e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
      else if (e.key === "Enter") { e.preventDefault(); router.push(hrefForKind(s.needsYou[sel]?.kind)); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, router, sel, s.needsYou]);

  return (
    <div className="kinly-today">
      <SystemStatusCard s={s} />
      {dailyBrief?.ok ? <DailyBriefCard brief={dailyBrief} /> : null}
      <div className="kinly-control-grid">
        <main className="kinly-control-main">
          <KpiRail s={s} />
          <DriftCard os={os} />
          <ValueChainCard s={s} />
          <NeedsYouCard items={s.needsYou} sel={sel} onSelect={setSel} queuePending={s.queue.pending} repliesPending={s.numbers.repliesPending} />
          <UsageSparkline data={s.dailySent} />
        </main>
        <DecisionPanel s={s} usage={usage} os={os} />
      </div>
    </div>
  );
}

function SystemStatusCard({ s }: { s: DeckSummary }) {
  const status = controlStatus(s);
  return (
    <section className="kinly-system-status" data-tone={status.tone} aria-label="Systemstatus">
      <span className="kinly-status-dot" aria-hidden />
      <div>
        <strong>{status.title}</strong>
        <p>{status.detail}</p>
      </div>
      {status.tone !== "ok" && (
        <Link href="/settings" className="kinly-status-link">Se status →</Link>
      )}
    </section>
  );
}

function KpiRail({ s }: { s: DeckSummary }) {
  const unavailable = "—";
  const kr = (n: number) => `${n.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr`;
  const metrics = [
    { label: "Leads klar", value: s.ok ? s.numbers.contactable.toLocaleString("da-DK") : unavailable, href: "/leads", local: false },
    { label: "Til godkendelse", value: s.queue.pending.toLocaleString("da-DK"), href: "/approve", local: true },
    { label: "Svar venter", value: s.ok ? s.numbers.repliesPending.toLocaleString("da-DK") : unavailable, href: "/replies", local: false },
    { label: "Fast pr. måned", value: s.ok ? kr(s.revenue.monthlyDKK) : unavailable, href: "/okonomi", local: false },
  ];
  return (
    <section className="kinly-kpi-rail" aria-label="Vigtigste tal">
      {metrics.map((metric) => (
        <Link key={metric.label} href={metric.href} className="kinly-kpi">
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          <small>{metric.local ? "lokal kø" : s.ok ? "Google Sheets" : "kilde utilgængelig"}</small>
        </Link>
      ))}
    </section>
  );
}

function DecisionPanel({ s, usage, os }: { s: DeckSummary; usage: HermesUsageSummary | null; os: OsData | null }) {
  const action = nextAction(s);
  const loops = usage?.businessLoops ?? [];
  const loopIssues = loops.filter((loop) => businessLoopState(loop) !== "ok").length;
  return (
    <aside className="kinly-decision-panel" aria-label="Kontekst og næste træk">
      <div className="kinly-decision-kicker"><Icon name="Sparkles" /> Næste træk</div>
      <div className="kinly-decision-number">{action.degraded ? "!" : action.count || "✓"}</div>
      <h2>{action.label}</h2>
      <p>{action.reason}</p>
      <Link href={action.href} className="kinly-decision-action">Åbn handling <Icon name="ArrowRight" /></Link>

      <div className="kinly-source-list">
        <h3>Datagrundlag</h3>
        <DataSource label="Leads og kunder" state={s.ok ? "live" : "fejl"} detail="Google Sheets" />
        <DataSource label="Godkendelser" state="live" detail="lokal kø" />
        <DataSource label="Kanban" state={os?.kanban?.ok ? "live" : "fejl"} detail={os?.kanban?.ok ? `${os.kanban.blocked?.length ?? 0} venter · ${os.kanban.doneLast7d ?? 0} færdige 7 d` : "VPS svarer ikke"} />
        <DataSource label="Synlighed" state={os?.synlighed?.ok ? "live" : "brief"} detail={os?.synlighed?.ok ? "GA4 · VPS-snapshot" : "GA4 afventer snapshot"} />
      </div>

      {s.pulse.length > 0 && (
        <Link href="/clients" className="kinly-panel-pulse">
          <Icon name="HeartPulse" />
          {s.pulse.length} kundesag{s.pulse.length === 1 ? "" : "er"} kræver opmærksomhed →
        </Link>
      )}

      <div className="kinly-panel-foot">
        <span>{loops.length ? `${loops.length - loopIssues}/${loops.length} loops uden fejl` : "Loops ikke nået"}</span>
        <strong>Sender aldrig selv</strong>
      </div>
    </aside>
  );
}


/* ------------------------------------------------------------------ */
/* OS-DRIFT                                                            */
/* ------------------------------------------------------------------ */
// Kanban + synlighed fra Hermes (VPS). Samme tal som OS-boardet — ingen writes.
function DriftCard({ os }: { os: OsData | null }) {
  const k = os?.kanban ?? null;
  const syn = os?.synlighed ?? null;
  const sites = syn?.ok ? Object.values(syn.sites ?? {}) : [];
  const ga4Ok = sites.filter((s) => s.ga4?.status === "ok").length;
  const gscOk = sites.filter((s) => s.gsc?.status === "ok").length;
  const blocked = k?.blocked?.length ?? 0;
  const active = k?.active?.length ?? 0;

  return (
    <section className="cc-card kinly-flow" aria-label="Agenter og drift">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--border)" }}>
        <Icon name="Activity" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Agenter &amp; drift</h2>
        <Link href="/drift" className="cc-link" style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600 }}>Hele OS&apos;et →</Link>
      </div>
      {!k?.ok && !syn?.ok ? (
        <div className="cc-empty">
          <Icon name="Activity" />
          <div>VPS&apos;en svarer ikke lige nu.</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>Kanban og synlighed hentes fra Hermes — prøv igen om lidt.</div>
        </div>
      ) : (
        <>
          <div className="kinly-flow-grid">
            <Link href="/drift" className="kinly-flow-step" data-state={blocked > 0 ? "missing" : "measured"}>
              <div className="cc-stat-l" style={{ marginTop: 0 }}>Venter på dig</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, color: blocked > 0 ? "var(--amber)" : "var(--text)" }}>{blocked}</div>
              <div className="cc-dim" style={{ fontSize: 11 }}>{k?.ok ? `af ${k.total ?? 0} kort i alt` : "kanban ikke læst"}</div>
            </Link>
            <Link href="/drift" className="kinly-flow-step">
              <div className="cc-stat-l" style={{ marginTop: 0 }}>I arbejde</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>{active}</div>
              <div className="cc-dim" style={{ fontSize: 11 }}>agenterne lige nu</div>
            </Link>
            <Link href="/drift" className="kinly-flow-step">
              <div className="cc-stat-l" style={{ marginTop: 0 }}>Færdige 7 dage</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>{k?.doneLast7d ?? 0}</div>
              <div className="cc-dim" style={{ fontSize: 11 }}>lukkede kort</div>
            </Link>
            <Link href="/seo" className="kinly-flow-step">
              <div className="cc-stat-l" style={{ marginTop: 0 }}>Synlighed</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600 }}>{sites.length ? `${ga4Ok}/${sites.length}` : "—"}</div>
              <div className="cc-dim" style={{ fontSize: 11 }}>{gscOk > 0 ? `GA4 · GSC på ${gscOk}` : "GA4 live · GSC mangler"}</div>
            </Link>
          </div>
          <div className="cc-dim" style={{ fontSize: 11, padding: "10px 22px" }}>
            {k?.ok && k.generatedAt ? `kanban læst for ${relTime(k.generatedAt)} siden` : "kanban ikke læst"}
            {syn?.ok && syn.generatedAt ? ` · synlighed opdateret for ${relTime(syn.generatedAt)} siden` : ""}
          </div>
        </>
      )}
    </section>
  );
}

function DataSource({ label, state, detail }: { label: string; state: "live" | "fejl" | "brief"; detail: string }) {
  return (
    <div className="kinly-source-row">
      <span className="kinly-source-state" data-state={state} aria-hidden />
      <span>{label}</span>
      <small>{detail}</small>
    </div>
  );
}


function ValueChainCard({ s }: { s: DeckSummary }) {
  const stages = buildValueChain(s).filter((stage) => !["visibility", "visits", "contact"].includes(stage.key));
  return (
    <section className="cc-card kinly-flow" aria-label="Lead-flow">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--border)" }}>
        <Icon name="Network" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Lead-flow</h2>
        <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 11.5 }}>fra lead til fast kunde</span>
      </div>
      <div className="kinly-flow-grid">
        {stages.map((st) => {
          const tone = st.state === "missing" ? "var(--amber)" : st.state === "unknown" ? "var(--text-dim)" : "var(--text)";
          return (
            <Link
              key={st.key}
              href={st.href}
              className="kinly-flow-step"
              data-state={st.state}
            >
              <div className="cc-stat-l" style={{ marginTop: 0 }}>{st.label}</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", color: tone }}>{st.value}</div>
              <div className="cc-dim" style={{ fontSize: 11 }}>{st.detail}</div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

const KIND_META: Record<NeedsYouItem["kind"], { icon: string; tone: string }> = {
  reply: { icon: "Mail", tone: "var(--accent-ink)" },
  callback: { icon: "Clock", tone: "var(--amber)" },
  interested: { icon: "HeartPulse", tone: "var(--blue)" },
};

// Each Morning Coffee item opens where the action actually lives — a reply goes
// to /replies, a callback or warm lead to /leads. (Approval of drafts is its own
// queue, surfaced as a single banner, not per-item "godkend nu".)
function hrefForKind(kind?: NeedsYouItem["kind"]): string {
  if (kind === "reply") return "/replies";
  // An approved/interested lead's next step is the approval queue (review + Send),
  // not the raw Leads pipeline — that's where the action lives.
  if (kind === "interested") return "/approve";
  return "/leads";
}

// "Hvad skal vi i dag" — the daily brief Lucas writes in Obsidian, read live from
// the vault. Leads the home screen: what today is about, in his own words. Falls
// back to a calm hint when no note exists yet (or the vault isn't reachable).
function DailyBriefCard({ brief }: { brief: DailyBrief | null }) {
  const [open, setOpen] = useState(true);
  const dateLabel = brief?.date
    ? new Date(brief.date + "T00:00:00").toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" })
    : "";

  if (!brief?.ok) {
    return (
      <div className="cc-brief-empty" aria-label="Hvad skal vi i dag">
        <Icon name="BookOpen" style={{ width: 16, height: 16 }} />
        <span>Ingen brief i dag endnu.</span>
        <span className="cc-dim">Skriv den i daily/{brief?.date ?? "i-dag"}.md, når den skal styre dagen.</span>
      </div>
    );
  }

  return (
    <section className="cc-card" aria-label="Hvad skal vi i dag">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: brief?.ok && open ? "1px solid var(--border)" : "none" }}>
        <Icon name="Sun" style={{ width: 18, height: 18, color: "var(--kinly-signal)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Hvad skal vi i dag</h2>
        {dateLabel && <span className="cc-dim" style={{ fontSize: 12.5, marginLeft: 2 }}>· {dateLabel}</span>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {brief?.ok && (
            <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Skjul" : "Vis"} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center" }}>
              <Icon name={open ? "ChevronUp" : "ChevronDown"} style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>
      </div>

      {open ? (
        <div className="cc-card-pad" style={{ paddingTop: 14 }}>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            <MarkdownLite source={brief.body} />
          </div>
          <div className="cc-dim" style={{ fontSize: 11.5, marginTop: 12 }}>
            kilde: {brief.source === "remote" ? "live vault" : brief.source} · {brief.pathRel}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function NeedsYouCard({ items, sel, onSelect, queuePending, repliesPending }: { items: NeedsYouItem[]; sel: number; onSelect: (i: number) => void; queuePending: number; repliesPending: number }) {
  return (
    <section className="cc-card" aria-label="Dagens opgaver">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--border)" }}>
        <Icon name="Coffee" style={{ width: 18, height: 18, color: "var(--kinly-signal)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Dagens opgaver</h2>
        {items.length > 0 && (
          <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 11.5, display: "flex", alignItems: "center", gap: 7 }}>
            <span className="cc-kbd">j</span><span className="cc-kbd">k</span> flyt · <span className="cc-kbd">↵</span> åbn
          </span>
        )}
      </div>

      {/* One calm pointer to the approval queue — not a "godkend nu" per item.
          The actual per-draft approval lives on /approve. */}
      {queuePending > 0 && (
        <Link href="/approve" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderBottom: "1px solid var(--border)", textDecoration: "none", color: "inherit", background: "var(--accent-soft)" }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--surface)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="CheckCheck" style={{ width: 15, height: 15, color: "var(--kinly-signal)" }} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{queuePending} udkast til godkendelse</div>
            <div className="cc-dim" style={{ fontSize: 12.5 }}>gennemgå og godkend i køen</div>
          </div>
          <span className="cc-link" style={{ fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}>
            Åbn <Icon name="ChevronRight" style={{ width: 13, height: 13 }} />
          </span>
        </Link>
      )}

      {/* One consolidated pointer for replies — NOT a row per reply (they used to
          flood this card 15×). Per-reply triage lives on /replies. */}
      {repliesPending > 0 && (
        <Link href="/replies" style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderBottom: "1px solid var(--border)", textDecoration: "none", color: "inherit" }}>
          <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg-3)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <Icon name="Mail" style={{ width: 15, height: 15, color: "var(--kinly-signal)" }} />
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{repliesPending} svar at besvare</div>
            <div className="cc-dim" style={{ fontSize: 12.5 }}>skriv personlige svar i indbakken</div>
          </div>
          <span className="cc-link" style={{ fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}>
            Åbn <Icon name="ChevronRight" style={{ width: 13, height: 13 }} />
          </span>
        </Link>
      )}

      {items.length === 0 ? (
        queuePending === 0 && repliesPending === 0 ? (
          <div className="cc-empty">
            <Icon name="Coffee" />
            <div>Ingen ildebrande. Drik kaffen i ro.</div>
            <div className="cc-dim" style={{ fontSize: 12 }}>Opkald i dag og varme leads dukker op her.</div>
          </div>
        ) : null
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {items.map((it, i) => {
            const m = KIND_META[it.kind];
            const active = i === sel;
            return (
              <li
                key={it.leadId + it.kind}
                onMouseEnter={() => onSelect(i)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 22px", borderBottom: "1px solid var(--border)", background: active ? "var(--accent-soft)" : "transparent", transition: "background 120ms ease" }}
              >
                <span style={{ width: 30, height: 30, borderRadius: 8, background: "var(--bg-3)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Icon name={m.icon} style={{ width: 15, height: 15, color: m.tone }} />
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                  <div className="cc-dim" style={{ fontSize: 12.5 }}>{it.why}{it.branch ? ` · ${it.branch}` : ""}</div>
                </div>
                <Link href={hrefForKind(it.kind)} className="cc-link" style={{ fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}>
                  Åbn <Icon name="ChevronRight" style={{ width: 13, height: 13 }} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}


/* ------------------------------------------------------------------ */
/* PIPELINE                                                            */
/* ------------------------------------------------------------------ */
// The canonical lead flow, spelled out so it's obvious what to press and in what
// order. Each step links to where the action actually lives. Step 4 (Kør motor)
// is the one that fills Godkendelse — the most-asked question.
const FLOW_STEPS: { n: number; title: string; detail: string; href: string; cta: string; optional?: boolean }[] = [
  { n: 1, title: "Hent leads", detail: "Skraber nye virksomheder ind i Sheets (råvarer).", href: "/leads", cta: "Åbn Leads" },
  { n: 2, title: "Verify", detail: "Scorer + vurderer websitet på hver lead.", href: "/leads", cta: "Åbn Leads" },
  { n: 3, title: "Kør motor", detail: "Skriver personlige udkast til de bedste leads → fylder Godkendelse. Det er HER køen fyldes.", href: "#kor-motor", cta: "Nedenfor ↓" },
  { n: 4, title: "Godkendelse", detail: "Du gennemgår og godkender hvert udkast.", href: "/approve", cta: "Åbn Godkendelse" },
  { n: 5, title: "Find emails + send", detail: "Find adresser og send de godkendte — separat, sender aldrig af sig selv.", href: "/leads", cta: "Åbn Leads" },
];

function FlowGuide() {
  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 4 }}>
        <Icon name="Workflow" style={{ width: 17, height: 17, color: "var(--kinly-signal)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Sådan virker det</h2>
      </div>
      <p className="cc-dim" style={{ fontSize: 13, marginBottom: 14 }}>
        Fra rå lead til godkendt mail. Leads kommer i Godkendelse via trin 3 — “Kør motor”.
      </p>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 0 }}>
        {FLOW_STEPS.map((step, i) => (
          <li key={step.n} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
            <span style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, background: step.n === 4 ? "var(--accent)" : "var(--bg-3)", color: step.n === 4 ? "#fff" : "var(--text-muted)", display: "grid", placeItems: "center", fontSize: 12.5, fontWeight: 700, fontFamily: "var(--font-display)" }}>{step.n}</span>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, display: "flex", alignItems: "center", gap: 7 }}>
                {step.title}
                {step.optional && <span className="cc-chip" style={{ height: 17, fontSize: 10 }}>valgfri</span>}
              </div>
              <div className="cc-dim" style={{ fontSize: 12.5, marginTop: 2 }}>{step.detail}</div>
            </div>
            {step.href.startsWith("#") ? (
              <a href={step.href} className="cc-link" style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", marginTop: 2 }}>{step.cta}</a>
            ) : (
              <Link href={step.href} className="cc-link" style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", marginTop: 2 }}>{step.cta}</Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function AutoEngineToggle({ cadence }: { cadence?: string | null }) {
  const router = useRouter();
  const [armed, setArmed] = useState<boolean>(cadence != null);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !armed;
    setArmed(next);
    setBusy(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoEngine: next }),
      });
      router.refresh();
    } catch {
      setArmed(!next); // revert on failure
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 11 }}>
      <Icon name="Calendar" style={{ width: 17, height: 17, color: armed ? "var(--kinly-signal)" : "var(--text-dim)" }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>
          {armed ? `Daglig auto-motor: tændt${cadence ? ` · næste ${cadence}` : ""}` : "Daglig auto-motor: slukket"}
        </div>
        <div className="cc-dim" style={{ fontSize: 12 }}>
          {armed ? "Fylder godkendelse hver morgen. Sender aldrig." : "Tænd, så fyldes godkendelse automatisk hver morgen."}
        </div>
      </div>
      <button
        role="switch"
        aria-checked={armed}
        aria-label="Daglig auto-motor"
        onClick={toggle}
        disabled={busy}
        style={{ width: 46, height: 27, borderRadius: 999, border: "none", cursor: busy ? "default" : "pointer", position: "relative", background: armed ? "var(--accent)" : "var(--border-strong)", transition: "background 160ms ease", flexShrink: 0, opacity: busy ? 0.7 : 1 }}
      >
        <span style={{ position: "absolute", top: 3, left: armed ? 22 : 3, width: 21, height: 21, borderRadius: "50%", background: "#fff", transition: "left 160ms cubic-bezier(0.22,1,0.36,1)" }} />
      </button>
      <Link href="/settings" className="cc-link" style={{ fontSize: 12.5 }}>Mere →</Link>
    </section>
  );
}

function PipelineTab({ s, cadence }: { s: DeckSummary; cadence?: string | null }) {
  const p = s.pipeline;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <FlowGuide />
      <AutoEngineToggle cadence={cadence} />
      <section className="cc-card cc-card-pad">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Motor-status</h2>
        <p className="cc-dim" style={{ fontSize: 13 }}>
          PICK → RESEARCH → QUALIFY → DRAFT → COLLECT. Motoren fylder kun køen — den sender aldrig.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 18, marginTop: 18 }}>
          <Stat label="drafts i alt" value={p.totalDrafts} />
          <Stat label="afventer" value={p.pending} />
          <Stat label="godkendt" value={p.approved} />
          <Stat label="afvist" value={p.rejected} />
        </div>
        <div className="cc-dim" style={{ fontSize: 12.5, marginTop: 16 }}>
          {p.lastRunAt ? `Sidste kørsel ${relTime(p.lastRunAt)} · kilde: ${p.source}` : "Ingen kørsler registreret endnu."}
        </div>
      </section>

      <div id="kor-motor" style={{ scrollMarginTop: 80 }}>
        <EngineRunner />
      </div>
      <FindEmailsButton />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GOALS & REVENUE                                                     */
/* ------------------------------------------------------------------ */
function GoalsTab({ s }: { s: DeckSummary }) {
  const rev = s.revenue;
  const kr = (n: number) => `${n.toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr`;
  // Real signals: clients (count + monthly fees) + replies today.
  const goals = [
    { label: "5 betalende kunder", current: rev.payingClientCount, target: 5, unit: "kunder" },
    { label: `${kr(rev.goalMonthlyDKK)} / md i abonnement`, current: rev.monthlyDKK, target: rev.goalMonthlyDKK, unit: "kr" },
    { label: "30 varme svar", current: s.numbers.repliesPending, target: 30, unit: "svar" },
  ];
  const revPct = Math.min(100, Math.round((rev.monthlyDKK / Math.max(1, rev.goalMonthlyDKK)) * 100));
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="cc-card cc-card-pad">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>90-dages mål</h2>
        <p className="cc-dim" style={{ fontSize: 13, marginBottom: 18 }}>
          Live tal fra Klienter-fanen. Detaljerede mål kan redigeres i vaulten (Goals-siden).
        </p>
        <div style={{ display: "grid", gap: 16 }}>
          {goals.map((g) => {
            const pct = Math.min(100, Math.round((g.current / g.target) * 100));
            return (
              <div key={g.label}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600 }}>{g.label}</span>
                  <span className="cc-dim">{g.current.toLocaleString("da-DK")} / {g.target.toLocaleString("da-DK")} {g.unit}</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cc-card cc-card-pad">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Indtjening vs. mål</h2>
        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 14 }}>
          <div>
            <div className="cc-stat-n" style={{ color: "var(--accent-ink)" }}>{kr(rev.monthlyDKK)}</div>
            <div className="cc-stat-l">løbende pr. måned · {rev.payingClientCount} betalende{rev.clientCount > rev.payingClientCount ? ` af ${rev.clientCount} i CRM` : ""}</div>
          </div>
          <div>
            <div className="cc-stat-n">{kr(rev.setupDKK)}</div>
            <div className="cc-stat-l">setup i alt</div>
          </div>
          <div>
            <div className="cc-stat-n">{revPct}%</div>
            <div className="cc-stat-l">af {kr(rev.goalMonthlyDKK)}-målet</div>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden" }}>
          <div style={{ width: `${revPct}%`, height: "100%", background: "var(--accent)", borderRadius: 999 }} />
        </div>
        {rev.clientCount === 0 && (
          <p className="cc-dim" style={{ fontSize: 12, marginTop: 10 }}>Ingen klienter i Sheets endnu (eller Sheets ikke nået) — tallene fyldes når klienter er registreret.</p>
        )}
        {rev.clientCount > 0 && rev.payingClientCount === 0 && (
          <p className="cc-dim" style={{ fontSize: 12, marginTop: 10 }}>{rev.clientCount} klient(er) registreret, men ingen med et beløb endnu. Indtast pris pr. klient på Klienter-siden — så tæller de med her.</p>
        )}
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AGENTS                                                              */
/* ------------------------------------------------------------------ */
function AgentsTab({ s, spend, usage }: { s: DeckSummary; spend: SpendSummary | null; usage: HermesUsageSummary | null }) {
  const spendCalls = spend ? spend.byModel.reduce((a, b) => a + b.calls, 0) : 0;
  const spendOn = spendCalls > 0;
  const kr = (n: number) => `${n.toLocaleString("da-DK", { maximumFractionDigits: n < 10 ? 2 : 0 })} kr`;
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 18 }}>
        <AgentCard
          icon="Sparkles"
          name="Claude"
          role="Hjernen / byggeren"
          status="aktiv"
          tone="var(--accent)"
          note="Bygger og analyserer. Kører dette command center."
        />
        <AgentCard
          icon="Radio"
          name="Hermes"
          role="24/7 baggrund"
          status="aktiv"
          tone="var(--accent)"
          note="Telegram + WebUI. Kører drømme-jobbet hver nat kl 02:00."
        />
      </div>

      <section className="cc-card cc-card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
          <Icon name="CircleDollarSign" style={{ width: 16, height: 16, color: "var(--kinly-signal)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>AI-forbrug</h2>
        </div>
        {spendOn ? (
          <>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
              <div>
                <div className="cc-stat-n" style={{ color: spend!.alert ? "var(--amber)" : "var(--accent-ink)" }}>{kr(spend!.todayDKK)}</div>
                <div className="cc-stat-l">i dag · {spendCalls} kald</div>
              </div>
              <div>
                <div className="cc-stat-n">{kr(spend!.totalDKK)}</div>
                <div className="cc-stat-l">i alt</div>
              </div>
              {spend!.byModel.slice(0, 3).map((m) => (
                <div key={m.key}>
                  <div className="cc-stat-n" style={{ fontSize: 18 }}>{kr(m.costUSD * 6.9)}</div>
                  <div className="cc-stat-l">{m.key} · {m.calls}×</div>
                </div>
              ))}
            </div>
            <div className="cc-dim" style={{ fontSize: 11.5, marginTop: 10 }}>
              Estimat (≈4 tegn/token). Alert ved 100 kr/dag · hard cap 150 kr/dag.
            </div>
          </>
        ) : (
          <div className="cc-dim" style={{ fontSize: 13 }}>
            Ingen AI-kørsler logget endnu — tallene fyldes når motoren kører med en API-nøgle.
            <div style={{ fontSize: 11.5, marginTop: 4 }}>Alert ved 100 kr/dag · hard cap 150 kr/dag.</div>
          </div>
        )}
      </section>

      <HermesUsageCard usage={usage} />

      <section className="cc-card cc-card-pad">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Skills & motorer</h2>
        <div style={{ display: "grid", gap: 0 }}>
          {[
            { n: "Daily engine", d: "PICK→DRAFT, fylder kø", on: true, label: "klar" },
            { n: "Daily-ops (Cowork)", d: "gratis dyb berigelse → løfter PICK", on: true, label: "wired" },
            { n: "Email-finder", d: "MX-verificeret opslag", on: true, label: "klar" },
            { n: "Reply-assistant", d: "klassificér + udkast", on: true, label: "klar" },
            { n: "AI Spend & Health", d: "pr. model + dagsgrænse", on: spendOn, label: spendOn ? "klar" : "ingen kørsler endnu" },
          ].map((r, i) => (
            <div key={r.n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.on ? "var(--accent)" : "var(--border-strong)" }} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.n}</span>
              <span className="cc-dim" style={{ fontSize: 12.5 }}>{r.d}</span>
              <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 11.5 }}>{r.label}</span>
            </div>
          ))}
        </div>
        <div className="cc-dim" style={{ fontSize: 12, marginTop: 14 }}>
          7-bucket dækning: {Object.values(s.buckets).filter(Boolean).length} / 7 forretningsområder aktive.
        </div>
      </section>
    </div>
  );
}

function HermesUsageCard({ usage }: { usage: HermesUsageSummary | null }) {
  if (!usage) {
    return (
      <section className="cc-card cc-card-pad">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Hermes-forbrug</h2>
        <p className="cc-dim" style={{ fontSize: 13, margin: 0 }}>Målingen kan ikke nå VPS&apos;en lige nu. Resten af appen virker stadig.</p>
      </section>
    );
  }

  const change = describeUsageChange(usage.changePct);
  const changeColor = change.state === "saving" ? "var(--accent-ink)" : change.state === "rising" ? "var(--amber)" : "var(--text-muted)";
  const activeJobs = usage.jobs.agent + usage.jobs.monitor + usage.jobs.noAgent;

  return (
    <section className="cc-card cc-card-pad" aria-label="Hermes tokenforbrug">
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14, flexWrap: "wrap" }}>
        <Icon name="Gauge" style={{ width: 16, height: 16, color: "var(--kinly-signal)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Hermes-forbrug</h2>
        <span className="cc-chip" style={{ marginLeft: "auto", color: changeColor }}>{change.label}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 18 }}>
        <div>
          <div className="cc-stat-n" style={{ color: changeColor }}>{formatTokenCount(usage.current24h.tokens)}</div>
          <div className="cc-stat-l">tokens · seneste 24 timer</div>
        </div>
        <div>
          <div className="cc-stat-n">{formatTokenCount(usage.previous24h.tokens)}</div>
          <div className="cc-stat-l">tokens · forrige 24 timer</div>
        </div>
        <div>
          <div className="cc-stat-n">{usage.jobs.noAgent} / {activeJobs}</div>
          <div className="cc-stat-l">aktive jobs kører uden AI</div>
        </div>
        <div>
          <div className="cc-stat-n">{usage.jobs.agent} + {usage.jobs.monitor}</div>
          <div className="cc-stat-l">AI-jobs + behovsstyrede monitors</div>
        </div>
      </div>

      <div className="cc-dim" style={{ fontSize: 11.5, marginTop: 12, lineHeight: 1.5 }}>
        {usage.current24h.runs} AI-kørsler i perioden
        {usage.topCurrent ? ` · mest: ${usage.topCurrent.name} (${formatTokenCount(usage.topCurrent.tokens)})` : ""}.
        {" "}Måler cronjobs på tværs af alle profiler. Tokens viser arbejdsmængde, ikke en faktura.
      </div>
    </section>
  );
}

function AgentCard({ icon, name, role, status, tone, note }: { icon: string; name: string; role: string; status: string; tone: string; note: string }) {
  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 38, height: 38, borderRadius: 10, background: "var(--bg-3)", display: "grid", placeItems: "center" }}>
          <Icon name={icon} style={{ width: 19, height: 19, color: tone }} />
        </span>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>{name}</div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>{role}</div>
        </div>
        <span className="cc-chip" style={{ marginLeft: "auto" }}>{status}</span>
      </div>
      <p className="cc-muted" style={{ fontSize: 13, marginTop: 12, marginBottom: 0 }}>{note}</p>
    </section>
  );
}

/* ------------------------------------------------------------------ */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="cc-stat-n">{value}</div>
      <div className="cc-stat-l">{label}</div>
    </div>
  );
}

function relTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const diff = Date.now() - t;
  const min = Math.round(diff / 60000);
  if (min < 1) return "lige nu";
  if (min < 60) return `for ${min} min siden`;
  const h = Math.round(min / 60);
  if (h < 24) return `for ${h} t siden`;
  const d = Math.round(h / 24);
  return `for ${d} dag${d === 1 ? "" : "e"} siden`;
}

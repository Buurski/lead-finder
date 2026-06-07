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
import type { SpendSummary } from "@/lib/spend-log";

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
  { id: "today", label: "Today", short: "I dag" },
  { id: "pipeline", label: "Pipeline", short: "Pipeline" },
  { id: "goals", label: "Goals & Revenue", short: "Mål" },
  { id: "agents", label: "Agents", short: "Agenter" },
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

interface Vital { task: string; label: string; ageMin: number | null; detail: string; status: "fresh" | "stale" | "missing" }

// Morgen-vitals — one-glance health of the 3 daily Cowork tasks (lead-gen, messenger,
// inbox). Derived from each output's artifact via /api/ops/status. Green = ran < 8h,
// amber = 8–26h, red = stale/never. Silent if the endpoint can't be reached.
function MorningVitals() {
  const [vitals, setVitals] = useState<Vital[] | null>(null);
  useEffect(() => {
    fetch("/api/ops/status")
      .then((r) => r.json())
      .then((d) => setVitals(Array.isArray(d.vitals) ? d.vitals : []))
      .catch(() => setVitals([]));
  }, []);
  if (!vitals || vitals.length === 0) return null;
  const dot = (s: string) => (s === "fresh" ? "var(--accent)" : s === "stale" ? "var(--amber)" : "var(--border-strong)");
  const age = (m: number | null) => (m == null ? "—" : m < 60 ? `${m}m` : `${Math.round(m / 60)}t`);
  return (
    <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
      <span className="cc-dim" style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.02em" }}>MORGEN-VITALS</span>
      {vitals.map((v) => (
        <div key={v.task} style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot(v.status), flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>{v.label}</span>
          <span className="cc-dim" style={{ fontSize: 12 }}>
            {v.status === "missing" ? "ingen kørsel" : `${age(v.ageMin)} siden · ${v.detail}`}
          </span>
        </div>
      ))}
    </div>
  );
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Sent oppe";
  if (h < 10) return "God morgen";
  if (h < 14) return "God formiddag";
  if (h < 18) return "God eftermiddag";
  return "God aften";
}

export default function MissionControl({ summary, cadence, spendAlert, spend, dailyBrief }: { summary: DeckSummary; cadence?: string | null; spendAlert?: string | null; spend?: SpendSummary | null; dailyBrief?: DailyBrief | null }) {
  const [tab, setTab] = useState<Tab>("today");
  const [hello, setHello] = useState("Velkommen");

  useEffect(() => {
    // Client-only greeting: server can't know the viewer's local hour, so we set
    // it after mount to avoid a hydration mismatch (SSR renders "Velkommen").
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHello(greeting(new Date()));
  }, []);

  return (
    <div className="cc-fade" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="cc-h1">{hello}, Lucas.</h1>
          <p className="cc-sub">{summaryLine(summary)}</p>
        </div>
        {/* On wider screens the tabs sit in the header; on mobile they move below
            the Today content (secondary nav) so the screen leads with what matters. */}
        <div className="cc-tabs-header"><TabNav tab={tab} setTab={setTab} /></div>
      </header>

      {/* On mobile the header tabs are hidden — show the view switcher at the TOP,
          right under the greeting (not at the bottom of the page). */}
      <div className="cc-tabs-secondary">
        <TabNav tab={tab} setTab={setTab} secondary />
      </div>

      {!summary.ok && (
        <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--amber)" }}>
          <Icon name="Activity" style={{ width: 17, height: 17, color: "var(--amber)" }} />
          <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
            Kunne ikke nå Google Sheets — viser hvad køen ved lokalt. Tal opdateres når forbindelsen er der.
          </span>
        </div>
      )}

      {spendAlert && (
        <Link href="/spend" className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--amber)", textDecoration: "none", color: "inherit" }}>
          <Icon name="CircleDollarSign" style={{ width: 17, height: 17, color: "var(--amber)" }} />
          <span style={{ fontSize: 13.5 }}>{spendAlert} — over dagsgrænsen. Se AI Spend →</span>
        </Link>
      )}

      <MorningVitals />

      {tab === "today" && <TodayTab s={summary} dailyBrief={dailyBrief ?? null} />}
      {tab === "pipeline" && <PipelineTab s={summary} cadence={cadence} />}
      {tab === "goals" && <GoalsTab s={summary} />}
      {tab === "agents" && <AgentsTab s={summary} spend={spend ?? null} />}
    </div>
  );
}

function summaryLine(s: DeckSummary): string {
  const bits: string[] = [];
  if (s.needsYou.length) bits.push(`${s.needsYou.length} kræver dig`);
  if (s.queue.pending) bits.push(`${s.queue.pending} i kø`);
  if (s.pulse.length) bits.push(`${s.pulse.length} kunder at følge op`);
  if (!bits.length) return "Alt er roligt. Intet kræver dig lige nu.";
  return bits.join(" · ");
}

/* ------------------------------------------------------------------ */
/* TODAY                                                               */
/* ------------------------------------------------------------------ */
function TodayTab({ s, dailyBrief }: { s: DeckSummary; dailyBrief: DailyBrief | null }) {
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
    <div style={{ display: "grid", gap: 18 }}>
      <DailyBriefCard brief={dailyBrief} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 0.8fr) minmax(0, 1.2fr)", gap: 18, alignItems: "stretch" }} className="cc-today-cols">
        <HeroNumber s={s} />
        <UsageSparkline data={s.dailySent} />
      </div>
      <NumbersStrip s={s} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)", gap: 18, alignItems: "start" }} className="cc-today-cols">
        <NeedsYouCard items={s.needsYou} sel={sel} onSelect={setSel} queuePending={s.queue.pending} repliesPending={s.numbers.repliesPending} />
        <div style={{ display: "grid", gap: 18 }}>
          <QueueCard s={s} />
          <PipelineMini s={s} />
        </div>
      </div>
      <PulseCard s={s} />
    </div>
  );
}

// The single most important number, big — what needs attention today.
function HeroNumber({ s }: { s: DeckSummary }) {
  const replies = s.numbers.repliesPending;
  const lead = replies > 0
    ? { value: replies, label: replies === 1 ? "svar at besvare — åbn det" : "svar at besvare — kig på dem", href: "/replies", tone: "var(--accent)" }
    : s.queue.pending > 0
      ? { value: s.queue.pending, label: "udkast venter på dig", href: "/approve", tone: "var(--accent)" }
      : { value: s.numbers.newLeads, label: "nye leads i pipelinen", href: "/leads", tone: "var(--text)" };
  return (
    <Link href={lead.href} className="cc-card cc-card-pad" style={{ display: "flex", flexDirection: "column", justifyContent: "center", textDecoration: "none", color: "inherit", minHeight: 96 }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 54, lineHeight: 1, letterSpacing: "-0.03em", color: lead.tone }}>{lead.value}</div>
      <div className="cc-muted" style={{ fontSize: 13.5, marginTop: 6 }}>{lead.label} →</div>
    </Link>
  );
}

function NumbersStrip({ s }: { s: DeckSummary }) {
  const n = s.numbers;
  const items = [
    { label: "nye leads", value: n.newLeads },
    { label: "sendt i dag", value: n.sentToday },
    { label: "svar at følge op", value: n.repliesPending },
    { label: "vundet i ugen", value: n.wonThisWeek },
  ];
  return (
    <div className="cc-card cc-card-pad cc-numbers">
      {items.map((it) => (
        <div key={it.label} className="cc-numbers-cell">
          <div className="cc-stat-n">{it.value}</div>
          <div className="cc-stat-l">{it.label}</div>
        </div>
      ))}
    </div>
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

  return (
    <section className="cc-card" aria-label="Hvad skal vi i dag">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: brief?.ok && open ? "1px solid var(--border)" : "none" }}>
        <Icon name="Sun" style={{ width: 18, height: 18, color: "var(--accent-ink)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Hvad skal vi i dag</h2>
        {dateLabel && <span className="cc-dim" style={{ fontSize: 12.5, marginLeft: 2 }}>· {dateLabel}</span>}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <Link href="/journal" className="cc-link" style={{ fontSize: 12.5, fontWeight: 600 }}>Journal →</Link>
          {brief?.ok && (
            <button onClick={() => setOpen((o) => !o)} aria-label={open ? "Skjul" : "Vis"} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", display: "grid", placeItems: "center" }}>
              <Icon name={open ? "ChevronUp" : "ChevronDown"} style={{ width: 16, height: 16 }} />
            </button>
          )}
        </div>
      </div>

      {!brief?.ok ? (
        <div className="cc-card-pad" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Icon name="BookOpen" style={{ width: 16, height: 16, color: "var(--text-dim)", marginTop: 2 }} />
          <div className="cc-dim" style={{ fontSize: 13, lineHeight: 1.55 }}>
            Ingen note for i dag endnu. Skriv dagens brief i Obsidian (<code style={{ fontSize: 12 }}>daily/{brief?.date ?? "i-dag"}.md</code>) — den dukker op her automatisk, så snart den er pushet.
          </div>
        </div>
      ) : open ? (
        <div className="cc-card-pad" style={{ paddingTop: 14 }}>
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            <MarkdownLite source={brief.body} />
          </div>
          <div className="cc-dim" style={{ fontSize: 11.5, marginTop: 12, display: "flex", gap: 8, alignItems: "center" }}>
            <span>kilde: {brief.source === "remote" ? "live vault" : brief.source}</span>
            <Link href="/journal" className="cc-link" style={{ marginLeft: "auto", fontWeight: 600 }}>Åbn i Journal →</Link>
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
        <Icon name="Coffee" style={{ width: 18, height: 18, color: "var(--accent-ink)" }} />
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
            <Icon name="CheckCheck" style={{ width: 15, height: 15, color: "var(--accent-ink)" }} />
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
            <Icon name="Mail" style={{ width: 15, height: 15, color: "var(--accent-ink)" }} />
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

function QueueCard({ s }: { s: DeckSummary }) {
  return (
    <section className="cc-card" aria-label="Godkendelses-kø">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: s.queue.top.length ? "1px solid var(--border)" : "none" }}>
        <Icon name="CheckCheck" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Godkendelses-kø</h2>
        <span className="cc-chip" style={{ marginLeft: "auto" }}>{s.queue.pending} afventer</span>
      </div>
      {s.queue.top.length === 0 ? (
        <div className="cc-empty">
          <Icon name="Inbox" />
          <div>Køen er tom.</div>
        </div>
      ) : (
        <>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {s.queue.top.map((d) => (
              <li key={d.id} style={{ padding: "11px 22px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                <div className="cc-dim" style={{ fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.subject || `${d.branch} · ${d.city}`}</div>
              </li>
            ))}
          </ul>
          <div style={{ padding: "12px 22px" }}>
            <Link href="/approve" className="cc-btn" style={{ width: "100%", justifyContent: "center" }}>Åbn godkendelse</Link>
          </div>
        </>
      )}
    </section>
  );
}

function PipelineMini({ s }: { s: DeckSummary }) {
  const p = s.pipeline;
  return (
    <section className="cc-card cc-card-pad" aria-label="Dagens pipeline">
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
        <Icon name="Workflow" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Dagens pipeline</h2>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
        <Mini label="drafts i alt" value={p.totalDrafts} />
        <Mini label="afventer" value={p.pending} />
        <Mini label="godkendt" value={p.approved} />
        <Mini label="afvist" value={p.rejected} />
      </div>
      <div className="cc-dim" style={{ fontSize: 12, marginTop: 12 }}>
        {p.lastRunAt ? `Sidste kørsel: ${relTime(p.lastRunAt)}` : "Motoren har ikke kørt endnu."}
      </div>
    </section>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <span style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 600 }}>{value}</span>
      <span className="cc-dim" style={{ fontSize: 12, marginLeft: 6 }}>{label}</span>
    </div>
  );
}

function PulseCard({ s }: { s: DeckSummary }) {
  return (
    <section className="cc-card" aria-label="Pulse Check">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: s.pulse.length ? "1px solid var(--border)" : "none" }}>
        <Icon name="HeartPulse" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Pulse Check · kunder</h2>
        <span className="cc-chip" style={{ marginLeft: "auto" }}>{s.pulse.length}</span>
      </div>
      {s.pulse.length === 0 ? (
        <div className="cc-empty">
          <Icon name="HeartPulse" />
          <div>Ingen kunder kræver opfølgning.</div>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 0 }}>
          {s.pulse.map((c, i) => (
            <div key={c.id} style={{ padding: "13px 22px", borderTop: i >= 0 ? "1px solid var(--border)" : "none", borderRight: "1px solid var(--border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
                <span className="cc-chip" style={{ height: 18, fontSize: 10 }}>{c.stage}</span>
              </div>
              <div className="cc-dim" style={{ fontSize: 12, marginTop: 3 }}>{c.reason}</div>
            </div>
          ))}
        </div>
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
        <Icon name="Workflow" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
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
      <Icon name="Calendar" style={{ width: 17, height: 17, color: armed ? "var(--accent-ink)" : "var(--text-dim)" }} />
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
function AgentsTab({ s, spend }: { s: DeckSummary; spend: SpendSummary | null }) {
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
          status="kommer snart"
          tone="var(--text-dim)"
          note="Telegram-handshake + nat-kørsler. Placeholder indtil bygget."
        />
      </div>

      <section className="cc-card cc-card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
          <Icon name="CircleDollarSign" style={{ width: 16, height: 16, color: "var(--accent-ink)" }} />
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>AI-forbrug</h2>
          <Link href="/spend" className="cc-link" style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600 }}>Detaljer →</Link>
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

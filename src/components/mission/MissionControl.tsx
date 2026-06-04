"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Icon from "@/components/shell/Icon";
import EngineRunner from "./EngineRunner";
import type { DeckSummary, NeedsYouItem } from "@/lib/deck";

type Tab = "today" | "pipeline" | "goals" | "agents";

const TABS: { id: Tab; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "pipeline", label: "Pipeline" },
  { id: "goals", label: "Goals & Revenue" },
  { id: "agents", label: "Agents" },
];

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 5) return "Sent oppe";
  if (h < 10) return "God morgen";
  if (h < 14) return "God formiddag";
  if (h < 18) return "God eftermiddag";
  return "God aften";
}

export default function MissionControl({ summary }: { summary: DeckSummary }) {
  const [tab, setTab] = useState<Tab>("today");
  const [hello, setHello] = useState("Velkommen");

  useEffect(() => {
    setHello(greeting(new Date()));
  }, []);

  return (
    <div className="cc-fade" style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <header style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h1 className="cc-h1">{hello}, Lucas.</h1>
          <p className="cc-sub">{summaryLine(summary)}</p>
        </div>
        <div className="cc-tabs" role="tablist" aria-label="Mission Control faner">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              data-active={tab === t.id}
              className="cc-tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {!summary.ok && (
        <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 10, borderColor: "var(--amber)" }}>
          <Icon name="Activity" style={{ width: 17, height: 17, color: "var(--amber)" }} />
          <span style={{ fontSize: 13.5, color: "var(--text-muted)" }}>
            Kunne ikke nå Google Sheets — viser hvad køen ved lokalt. Tal opdateres når forbindelsen er der.
          </span>
        </div>
      )}

      {tab === "today" && <TodayTab s={summary} />}
      {tab === "pipeline" && <PipelineTab s={summary} />}
      {tab === "goals" && <GoalsTab s={summary} />}
      {tab === "agents" && <AgentsTab s={summary} />}
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
function TodayTab({ s }: { s: DeckSummary }) {
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
      else if (e.key === "Enter") { e.preventDefault(); router.push("/approve"); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [n, router]);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <NumbersStrip s={s} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.55fr) minmax(0, 1fr)", gap: 18, alignItems: "start" }} className="cc-today-cols">
        <NeedsYouCard items={s.needsYou} sel={sel} onSelect={setSel} />
        <div style={{ display: "grid", gap: 18 }}>
          <QueueCard s={s} />
          <PipelineMini s={s} />
        </div>
      </div>
      <PulseCard s={s} />
      <style>{`@media (max-width: 820px){ .cc-today-cols { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}

function NumbersStrip({ s }: { s: DeckSummary }) {
  const n = s.numbers;
  const items = [
    { label: "nye leads", value: n.newLeads },
    { label: "emails fundet", value: n.withEmail },
    { label: "svar i dag", value: n.repliesToday },
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

function NeedsYouCard({ items, sel, onSelect }: { items: NeedsYouItem[]; sel: number; onSelect: (i: number) => void }) {
  return (
    <section className="cc-card" aria-label="Kræver dig nu">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--border)" }}>
        <Icon name="Coffee" style={{ width: 18, height: 18, color: "var(--accent-ink)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Morning Coffee · kræver dig nu</h2>
        {items.length > 0 && (
          <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 11.5, display: "flex", alignItems: "center", gap: 7 }}>
            <span className="cc-kbd">j</span><span className="cc-kbd">k</span> flyt · <span className="cc-kbd">↵</span> åbn
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="cc-empty">
          <Icon name="Coffee" />
          <div>Ingen ildebrande. Drik kaffen i ro.</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>Svar, opkald i dag og varme leads dukker op her.</div>
        </div>
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
                <Link href="/approve" className="cc-link" style={{ fontSize: 12.5, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3 }}>
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
function PipelineTab({ s }: { s: DeckSummary }) {
  const p = s.pipeline;
  return (
    <div style={{ display: "grid", gap: 18 }}>
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

      <EngineRunner />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* GOALS & REVENUE                                                     */
/* ------------------------------------------------------------------ */
const GOALS = [
  { label: "5 betalende kunder", current: 0, target: 5, unit: "kunder" },
  { label: "10.000 kr / md i abonnement", current: 0, target: 10000, unit: "kr" },
  { label: "30 varme svar", current: 0, target: 30, unit: "svar" },
];

function GoalsTab({ s }: { s: DeckSummary }) {
  // wonThisWeek + clients give the only live signal we have without the vault.
  const goals = GOALS.map((g, i) => (i === 0 ? { ...g, current: s.numbers.wonThisWeek } : g));
  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="cc-card cc-card-pad">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, marginBottom: 4 }}>90-dages mål</h2>
        <p className="cc-dim" style={{ fontSize: 13, marginBottom: 18 }}>
          Mål og priser flytter til vaulten (KnowledgeOS) i Fase C. Indtil da er det her et roligt skelet.
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
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Indtjening vs. mål</h2>
        <div className="cc-empty" style={{ padding: "26px 18px" }}>
          <Icon name="Target" />
          <div>Priser hentes fra vaulten (context/priser.md) i Fase C.</div>
          <div className="cc-dim" style={{ fontSize: 12 }}>Når GitHub-handshake står, vises rigtig omsætning her.</div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* AGENTS                                                              */
/* ------------------------------------------------------------------ */
function AgentsTab({ s }: { s: DeckSummary }) {
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
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Skills & motorer</h2>
        <div style={{ display: "grid", gap: 0 }}>
          {[
            { n: "Daily engine", d: "PICK→DRAFT, fylder kø", on: true },
            { n: "Email-finder", d: "MX-verificeret opslag", on: true },
            { n: "Reply-assistant", d: "klassificér + udkast", on: true },
            { n: "AI Spend & Health", d: "pr. model + vault-lint", on: false },
          ].map((r, i) => (
            <div key={r.n} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.on ? "var(--accent)" : "var(--border-strong)" }} />
              <span style={{ fontWeight: 600, fontSize: 13.5 }}>{r.n}</span>
              <span className="cc-dim" style={{ fontSize: 12.5 }}>{r.d}</span>
              <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 11.5 }}>{r.on ? "klar" : "Fase C"}</span>
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

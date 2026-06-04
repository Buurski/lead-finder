import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import Link from "next/link";
import { aiStatus } from "@/lib/ai";
import { vaultStatus } from "@/lib/vault";
import { summarize } from "@/lib/spend-log";

export const metadata = { title: "Claude · Command Center" };
export const dynamic = "force-dynamic";

const CAPS = [
  { t: "Bygger", d: "Skriver og refaktorerer hele systemet — frontend, routes, datalag." },
  { t: "Analyserer", d: "Læser leads, svar og kø; foreslår hvad der kræver dig." },
  { t: "Skriver i din stemme", d: "Udkast til kolde mails og svar gennem tone-mixer + soul.md." },
  { t: "Holder mennesket i loop", d: "Sender og sletter aldrig selv. Alt går gennem en bekræftelse." },
];

export default function ClaudePage() {
  const ai = aiStatus();
  const vault = vaultStatus();
  const spend = summarize();

  const connections = [
    { name: "AI-model", ok: ai.enabled, detail: ai.enabled ? `${ai.provider} · ${ai.models.draft}` : "ingen nøgle — deterministisk fallback" },
    { name: "Vault (KnowledgeOS)", ok: vault.hasLocal || vault.tokenSet, detail: vault.hasLocal ? "lokal mirror" : vault.tokenSet ? `GitHub: ${vault.repo}` : "ikke koblet på" },
    { name: "Google Sheets", ok: Boolean(process.env.GOOGLE_SHEET_ID), detail: process.env.GOOGLE_SHEET_ID ? "konfigureret" : "mangler creds" },
    { name: "Gmail (IMAP/SMTP)", ok: Boolean(process.env.GMAIL_USER), detail: process.env.GMAIL_USER ? "kun QA til buur.aigro" : "ikke sat" },
  ];

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Sparkles"
        title="Claude"
        subtitle="Hjernen og byggeren — og hvad jeg lige nu har adgang til."
        action={<span className="cc-chip"><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} /> aktiv</span>}
      />

      <div style={{ display: "grid", gap: 18 }}>
        <section className="cc-card cc-card-pad">
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Forbindelser</h2>
          <div style={{ display: "grid", gap: 0 }}>
            {connections.map((c, i) => (
              <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 0", borderTop: i ? "1px solid var(--border)" : "none" }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: c.ok ? "var(--accent)" : "var(--border-strong)" }} />
                <span style={{ fontWeight: 600, fontSize: 13.5 }}>{c.name}</span>
                <span className="cc-dim" style={{ fontSize: 12.5, marginLeft: "auto", textAlign: "right" }}>{c.detail}</span>
              </div>
            ))}
          </div>
          <div className="cc-dim" style={{ fontSize: 12, marginTop: 12 }}>
            Modeller: research/qualify {ai.models.research} · draft {ai.models.draft}. AI-forbrug i dag: {(spend.todayDKK).toLocaleString("da-DK", { maximumFractionDigits: 0 })} kr.
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {CAPS.map((c) => (
            <section key={c.t} className="cc-card cc-card-pad">
              <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 4 }}>{c.t}</div>
              <p className="cc-muted" style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>{c.d}</p>
            </section>
          ))}
        </div>

        <section className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Icon name="Map" style={{ width: 20, height: 20, color: "var(--accent-ink)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>Planen & historikken</div>
            <div className="cc-dim" style={{ fontSize: 12.5 }}>Faser, beslutninger og guardrails ligger i Plan-historik.</div>
          </div>
          <Link href="/build-guide" className="cc-btn">Åbn Plan-historik</Link>
        </section>
      </div>
    </div>
  );
}

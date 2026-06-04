import PageHeader from "@/components/shell/PageHeader";
import Icon from "@/components/shell/Icon";
import Link from "next/link";

export const metadata = { title: "Claude · Command Center" };

const CAPS = [
  { t: "Bygger", d: "Skriver og refaktorerer hele systemet — frontend, routes, datalag." },
  { t: "Analyserer", d: "Læser leads, svar og kø; foreslår hvad der kræver dig." },
  { t: "Skriver i din stemme", d: "Udkast til kolde mails og svar gennem soul.md / voice-guide." },
  { t: "Holder mennesket i loop", d: "Sender og sletter aldrig selv. Alt går gennem en bekræftelse." },
];

export default function ClaudePage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Sparkles"
        title="Claude"
        subtitle="Hjernen og byggeren i midten af command center'et."
        action={<span className="cc-chip"><span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} /> aktiv</span>}
      />
      <div style={{ display: "grid", gap: 18 }}>
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
            <div style={{ fontWeight: 600, fontSize: 14 }}>Sådan arbejder vi sammen</div>
            <div className="cc-dim" style={{ fontSize: 12.5 }}>Planen, faserne og guardrails ligger i Build Guide.</div>
          </div>
          <Link href="/build-guide" className="cc-btn">Åbn Build Guide</Link>
        </section>

        <section className="cc-card cc-card-pad">
          <div className="cc-kicker" style={{ marginBottom: 8 }}>Live chat med Claude</div>
          <p className="cc-muted" style={{ fontSize: 13.5, margin: 0, lineHeight: 1.55 }}>
            Den kontekstuelle chat sidder nederst til højre (Chat / Control Room). Et rigtigt skrive-felt,
            der kan køre handlinger med dry-run og bekræftelse, tændes i Fase B.
          </p>
        </section>
      </div>
    </div>
  );
}

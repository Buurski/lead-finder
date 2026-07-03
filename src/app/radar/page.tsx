import PageHeader from "@/components/shell/PageHeader";
import Link from "next/link";

export const metadata = { title: "Radar · AgenticOS" };

// Coming-soon-stub: den rigtige AI-Radar-side ligger på branchen
// archive/thin-pages-2026-07-02 og kan genoplives derfra hvis Lucas får brug
// for den. Indtil da: menu-punktet virker, siden fortæller hvor tingene er.
export default function RadarPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Rss"
        title="Radar"
        subtitle="AI-radar er parkeret, ikke slettet."
      />
      <section className="cc-card cc-card-pad" style={{ maxWidth: 560 }}>
        <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0 }}>
          Radar-siden blev arkiveret i CC-trimningen (Bundle E, 2026-07-02) og
          ligger på branchen <code>archive/thin-pages-2026-07-02</code>. Sig til
          Claude hvis den skal genoplives, så flyttes den tilbage hertil.
        </p>
        <p className="cc-dim" style={{ fontSize: 13, margin: "12px 0 0" }}>
          Indtil da: find nye leads på <Link href="/leadgen" className="cc-link">Leadgen</Link>.
        </p>
      </section>
    </div>
  );
}

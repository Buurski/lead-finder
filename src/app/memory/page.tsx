import PageHeader from "@/components/shell/PageHeader";
import FaseNote from "@/components/shell/FaseNote";
import Icon from "@/components/shell/Icon";

export const metadata = { title: "Memory · Command Center" };

const SECTIONS = [
  { icon: "Briefcase", label: "Kunder", d: "noter pr. lead/klient, opdateret ved status-skift" },
  { icon: "Workflow", label: "Proces", d: "hvordan systemet arbejder — claude.md, soul.md" },
  { icon: "Target", label: "Priser", d: "context/priser.md — kilde til indtjening" },
  { icon: "Sparkles", label: "Brand", d: "stemme og tone, så alt lyder som dig" },
];

export default function MemoryPage() {
  return (
    <div className="cc-fade">
      <PageHeader icon="Brain" title="Memory" subtitle="Second brain — KnowledgeOS-vaulten, læsbar herfra." />
      <div style={{ display: "grid", gap: 18 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
          {SECTIONS.map((sct) => (
            <section key={sct.label} className="cc-card cc-card-pad" style={{ opacity: 0.92 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
                <Icon name={sct.icon} style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{sct.label}</span>
              </div>
              <p className="cc-muted" style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{sct.d}</p>
            </section>
          ))}
        </div>

        <FaseNote
          phase="Fase C"
          title="Vault-handshake"
          points={[
            "Appen læser KnowledgeOS (Buurski/KnowledgeOS på GitHub) — kunder, proces, priser, brand.",
            "Agenter læser context/ + claude.md + soul.md FØR de handler og skriver ny viden tilbage.",
            "hot.md hot-cache: ~500 tegn dagskontekst for lynhurtig, billig adgang.",
            "Token-disciplin: kun de nødvendige noter indlæses, aldrig hele vaulten på én gang.",
          ]}
        />
      </div>
    </div>
  );
}

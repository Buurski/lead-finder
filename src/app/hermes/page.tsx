import PageHeader from "@/components/shell/PageHeader";
import FaseNote from "@/components/shell/FaseNote";

export const metadata = { title: "Hermes · Command Center" };

export default function HermesPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Radio"
        title="Hermes"
        subtitle="Den 24/7 baggrundsagent — bygges senere."
        action={<span className="cc-chip">kommer snart</span>}
      />
      <div style={{ display: "grid", gap: 18 }}>
        <FaseNote
          phase="Fase C"
          title="Hvad Hermes skal kunne"
          points={[
            "Køre om natten: motoren, email-opslag og svar-sync uden at du rører noget.",
            "Telegram-handshake: tag imod 'skriv til X' eller 'kør motoren' på farten.",
            "Skrive til samme KnowledgeOS-vault som appen læser fra, så mobil-noter dukker op her.",
            "Sende dig en rolig morgen-brief i stedet for at spamme dig i løbet af dagen.",
          ]}
        />
        <FaseNote
          phase="Fase C"
          title="Handshake"
          points={[
            "Appen og Hermes deler GitHub-repoet Buurski/KnowledgeOS som fælles hukommelse.",
            "Railway remote MCP eksponerer vaulten 24/7, så begge sider ser det samme.",
          ]}
        />
      </div>
    </div>
  );
}

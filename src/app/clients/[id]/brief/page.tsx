import BriefForm from "@/components/BriefForm";
import { getClients, getLeads } from "@/lib/sheets";
import type { DeepResearch } from "@/app/api/leads/[id]/deep-research/route";

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // Load client + matching lead (for enriched data)
  const [clients, leads] = await Promise.all([getClients(), getLeads()]);
  const client = clients.find(c => c.id === id);
  const lead = client ? leads.find(l => l.name.toLowerCase() === client.name.toLowerCase()) : null;

  // Parse enrichedInfo — prefer deep research (type: "deep"), fall back to simple
  let deepResearch: DeepResearch | undefined;
  const autoFill: Partial<{
    clientName: string; branch: string; city: string;
    customers: string; tone: string; colorVibe: string;
    services: string; differentiator: string; hasLogo: string;
  }> = {};

  if (client) {
    autoFill.clientName = client.name;
    autoFill.branch = client.branch;
  }
  if (lead) {
    autoFill.city = lead.city;
    if (lead.enrichedInfo) {
      try {
        const parsed = JSON.parse(lead.enrichedInfo);
        if (parsed.type === "deep") {
          const r = parsed as DeepResearch;
          deepResearch = r;
          if (r.autoFilledBrief?.customers) autoFill.customers = r.autoFilledBrief.customers;
          if (r.autoFilledBrief?.tone) autoFill.tone = r.autoFilledBrief.tone;
          if (r.autoFilledBrief?.colorVibe) autoFill.colorVibe = r.autoFilledBrief.colorVibe;
          if (r.autoFilledBrief?.services) autoFill.services = r.autoFilledBrief.services;
          if (r.autoFilledBrief?.differentiator) autoFill.differentiator = r.autoFilledBrief.differentiator;
          if (r.autoFilledBrief?.hasLogo)       autoFill.hasLogo       = r.autoFilledBrief.hasLogo;
        }
      } catch { /* ignore parse errors */ }
    }
  }

  const hasDeepResearch = (() => {
    if (!lead?.enrichedInfo) return false;
    try { return JSON.parse(lead.enrichedInfo).type === "deep"; } catch { return false; }
  })();

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <div>
        <h1 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>
          Design Brief
        </h1>
        <p style={{ fontSize: 13, marginTop: 4, color: "var(--text-muted)" }}>
          Udfyld disse oplysninger. De gemmes i et CLAUDE.md projekt som du kan åbne i Claude Code.
        </p>
        {hasDeepResearch && (
          <p style={{
            fontSize: 12, marginTop: 8, padding: "6px 10px",
            background: "oklch(97% 0.015 145)", border: "1px solid oklch(88% 0.05 145)",
            borderRadius: 6, color: "oklch(35% 0.1 145)",
          }}>
            Felter er forudfyldt fra baggrundsinformation — tilret gerne før du opretter projektet.
          </p>
        )}
      </div>
      <BriefForm clientId={id} leadId={lead?.id} initialValues={autoFill} deepResearch={deepResearch} />
    </div>
  );
}

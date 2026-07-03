import PageHeader from "@/components/shell/PageHeader";
import SeoClient from "./SeoClient";
import SeoTjekFunnel from "./SeoTjekFunnel";
import { getClients } from "@/lib/sheets";
import type { Client } from "@/lib/sheets";

export const metadata = { title: "SEO · Command Center" };
export const dynamic = "force-dynamic";

export default async function SeoPage() {
  let clients: Client[] = [];
  let ok = true;
  try {
    clients = await getClients();
  } catch {
    ok = false;
  }

  const rows = clients.map((c) => ({ id: c.id, name: c.name, branch: c.branch, websiteStatus: c.websiteStatus }));

  return (
    <div className="cc-fade">
      <PageHeader
        icon="Search"
        title="SEO"
        subtitle="Søgning og AI-synlighed pr. klient. Schema-scan kører altid; index + AI-synlighed på fuld-niveau (fx VIDA)."
      />
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <SeoTjekFunnel />
        <SeoClient clients={rows} ok={ok} />
      </div>
    </div>
  );
}

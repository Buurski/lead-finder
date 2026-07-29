import PageHeader from "@/components/shell/PageHeader";
import SeoClient from "./SeoClient";
import SeoTjekFunnel from "./SeoTjekFunnel";
import { getClients } from "@/lib/sheets";
import type { Client } from "@/lib/sheets";

export const metadata = { title: "SEO-overblik · Kinly Lead System" };
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
    <div className="cc-fade kinly-page">
      <PageHeader
        icon="Search"
        title="SEO-overblik"
        subtitle="Se hvad der hjælper eller holder kundernes sites tilbage — uden at grave gennem rapporter."
      />
      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "minmax(0, 1fr)" }}>
        <SeoTjekFunnel />
        <SeoClient clients={rows} ok={ok} />
      </div>
    </div>
  );
}

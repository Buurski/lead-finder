import PageHeader from "@/components/shell/PageHeader";
import NewDemoClient from "./NewDemoClient";
import Link from "next/link";

export const metadata = { title: "Ny demo · Studio" };

export default function NewDemoPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="LayoutGrid"
        title="Lav demo"
        subtitle="Recon kundens side, bland med branche-template, byg en demo lokalt. Ingen auto-deploy."
        action={<Link href="/studio" className="cc-btn">← Studio</Link>}
      />
      <NewDemoClient />
    </div>
  );
}

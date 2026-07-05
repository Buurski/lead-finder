import PageHeader from "@/components/shell/PageHeader";
import StudioGrid from "./StudioGrid";
import Link from "next/link";

export const metadata = { title: "Studio · Command Center" };

export default function StudioPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="LayoutGrid"
        title="Studio"
        subtitle="Demoer og klient-sites. Live preview, filtrér efter branche, åbn i ny fane."
        action={<span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link href="/studio/compare" className="cc-btn">Sammenlign demoer →</Link>
          <Link href="/studio/prompt-gen" className="cc-btn cc-btn-accent">+ Lav demo</Link>
        </span>}
      />
      <StudioGrid />
    </div>
  );
}

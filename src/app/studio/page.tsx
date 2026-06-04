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
        subtitle="Demoer og klient-sites — live preview, filtrér efter branche, åbn i ny fane."
        action={<Link href="/studio/new" className="cc-btn cc-btn-accent">+ Lav demo</Link>}
      />
      <StudioGrid />
    </div>
  );
}

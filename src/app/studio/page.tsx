import PageHeader from "@/components/shell/PageHeader";
import StudioGrid from "./StudioGrid";
import Link from "next/link";

export const metadata = { title: "Studio · Kinly Lead System" };

export default function StudioPage() {
  return (
    <div className="cc-fade kinly-page">
      <PageHeader
        icon="LayoutGrid"
        title="Studio"
        subtitle="Demoer og klient-sites. Live preview, filtrér efter branche, åbn i ny fane."
        action={<Link href="/studio/compare" className="cc-btn">Sammenlign demoer →</Link>}
      />
      <StudioGrid />
    </div>
  );
}

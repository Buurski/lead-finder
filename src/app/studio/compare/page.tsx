import PageHeader from "@/components/shell/PageHeader";
import Link from "next/link";
import CompareClient from "./CompareClient";

export const metadata = { title: "Sammenlign demoer · Studio" };

export default function ComparePage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Columns3"
        title="Sammenlign demoer"
        subtitle="Samme motor, vidt forskellige sites. Tre caféer side om side beviser at hver demo er kulturelt forankret, ikke en skabelon."
        action={<Link href="/studio" className="cc-btn">← Tilbage til Studio</Link>}
      />
      <CompareClient />
    </div>
  );
}

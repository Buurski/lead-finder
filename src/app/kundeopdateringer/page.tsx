import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listUpdates, type UpdateStatus } from "@/lib/hq/customer-updates";
import PageHeader from "@/components/shell/PageHeader";
import KundeopdateringerView from "@/components/kundeopdateringer/KundeopdateringerView";
import "@/components/virksomheder/virksomheder.css";

export const dynamic = "force-dynamic";

const STATUSES: UpdateStatus[] = ["kladde", "sendt", "kasseret"];
const LABEL: Record<UpdateStatus, string> = { kladde: "Kladder", sendt: "Sendt", kasseret: "Kasseret" };

export default async function KundeopdateringerPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const status: UpdateStatus = (STATUSES as string[]).includes(sp.status ?? "") ? (sp.status as UpdateStatus) : "kladde";

  const db = getDb();
  const updates = await listUpdates(db, status);

  return (
    <div className="cc-fade kinly-page" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader icon="Mail" title="Kundeopdateringer" subtitle="Kladder til kunder om arbejde de må se — du sender selv fra Gmail." />

      <nav className="virk-chips" aria-label="Filtrér på status">
        {STATUSES.map((s) => (
          <Link key={s} href={`/kundeopdateringer?status=${s}`} className="virk-chip" aria-current={status === s ? "true" : undefined}>
            {LABEL[s]}
          </Link>
        ))}
      </nav>

      <KundeopdateringerView key={status} status={status} updates={updates} />
    </div>
  );
}

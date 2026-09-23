import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { company } from "@/lib/db/schema";

// /virksomheder/c/[clientNo] — det gamle kunde-id (Clients-fanens rækkenummer).
// Slår op i Postgres og sender videre til den rigtige virksomhedsprofil.
export default async function VirksomhederClientPage({ params }: { params: Promise<{ clientNo: string }> }) {
  const { clientNo } = await params;
  const n = parseInt(clientNo, 10);
  if (!Number.isFinite(n)) notFound();

  const [row] = await getDb()
    .select({ id: company.id })
    .from(company)
    .where(and(eq(company.clientNo, n), eq(company.archived, false)));
  if (!row) notFound();

  redirect(`/virksomheder/${row.id}`);
}

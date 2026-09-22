import ClientDetailPage from "@/app/clients/[id]/page";

// /virksomheder/c/[clientNo] — fase 2 Task 1-placeholder. Den rigtige profil
// (header, deals, tidslinje, kundeviden) bygges i Task 4; indtil da genbruges
// den gamle kundeprofil uændret, adresseret via det nye clientNo-segment.
export default async function VirksomhederClientPage({ params }: { params: Promise<{ clientNo: string }> }) {
  const { clientNo } = await params;
  return <ClientDetailPage params={Promise.resolve({ id: clientNo })} />;
}

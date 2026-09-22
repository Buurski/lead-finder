import ClientsPage from "@/app/clients/page";

// /virksomheder — fase 2 Task 1-placeholder. Den rigtige liste (søg, filtre
// livsfase/kunde/ejer) bygges i Task 4; indtil da genbruges den gamle
// kundeliste uændret, så ruten ikke er tom.
export const revalidate = 0;

export default function VirksomhederPage() {
  return <ClientsPage />;
}

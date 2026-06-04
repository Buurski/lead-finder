import PageHeader from "@/components/shell/PageHeader";
import RepliesClient from "./RepliesClient";

export const metadata = { title: "Svar · Command Center" };

export default function RepliesPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Mail"
        title="Svar"
        subtitle="Indbakke-triage: indkommende svar, for-klassificeret med et foreslået svar. Read-only."
      />
      <RepliesClient />
    </div>
  );
}

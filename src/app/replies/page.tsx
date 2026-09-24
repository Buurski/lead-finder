import PageHeader from "@/components/shell/PageHeader";
import RepliesClient from "./RepliesClient";

export const metadata = { title: "Svar · Command Center" };

export const dynamic = "force-dynamic";

export default function RepliesPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Mail"
        title="Svar"
        subtitle="Svar fra leads med et forslag til svar. Du svarer i Gmail-tråden."
      />
      <RepliesClient />
    </div>
  );
}

import PageHeader from "@/components/shell/PageHeader";
import LeadgenPanel from "./LeadgenPanel";

export const metadata = { title: "Gratis udkast · Command Center" };

export default function LeadgenPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Radar"
        title="Gratis udkast"
        subtitle="Find lokale virksomheder, vurder dem og fyld godkendelseskøen med personlige udkast. Intet sendes automatisk."
      />
      <LeadgenPanel />
    </div>
  );
}

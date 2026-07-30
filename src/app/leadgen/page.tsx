import PageHeader from "@/components/shell/PageHeader";
import LeadgenPanel from "./LeadgenPanel";

export const metadata = { title: "Lead-motor · Command Center" };

export default function LeadgenPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Radar"
        title="Lead-motor"
        subtitle="Intern sourcing og automatisk klargøring af outreach-udkast. Den rigtige kundedemo-kø ligger under Gratis udkast."
      />
      <LeadgenPanel />
    </div>
  );
}

import PageHeader from "@/components/shell/PageHeader";
import LeadgenPanel from "./LeadgenPanel";

export const metadata = { title: "Lead-gen · Command Center" };

export default function LeadgenPage() {
  return (
    <div className="cc-fade">
      <PageHeader
        icon="Search"
        title="Lead-gen"
        subtitle="Live lead-feed. Den daglige Cowork-task sourcer + deep-rater (website + Facebook) og fylder de bedste leads ind her. Kør en hurtig Places-scrape selv når du vil."
      />
      <LeadgenPanel />
    </div>
  );
}

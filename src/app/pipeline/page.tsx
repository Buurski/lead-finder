import LeadsPage from "@/app/leads/page";

// /pipeline — fase 2 Task 1-placeholder. Den rigtige deal-kanban bygges i
// Task 5 (docs/superpowers/plans/2026-09-22-crm-hq-fase-2-skal-hq.md); indtil
// da genbruges den gamle lead-pipeline uændret, så ruten ikke er tom.
export const revalidate = 60;

export default function PipelinePage() {
  return <LeadsPage />;
}

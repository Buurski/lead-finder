"use client";
import { useState } from "react";
import type { Lead } from "@/lib/sheets";
import EmailStatsPanel, { type EmailFilter } from "./EmailStatsPanel";
import LeadTable from "./LeadTable";

export default function EmailDashboardClient({ leads, sheetsOk = true }: { leads: Lead[]; sheetsOk?: boolean }) {
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");

  return (
    <>
      <EmailStatsPanel leads={leads} activeFilter={emailFilter} onFilter={setEmailFilter} />
      <LeadTable leads={leads} emailFilter={emailFilter} sheetsOk={sheetsOk} />
    </>
  );
}

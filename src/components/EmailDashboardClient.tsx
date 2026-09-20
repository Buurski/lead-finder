"use client";
import { useState } from "react";
import type { Lead } from "@/lib/sheets";
import EmailStatsPanel, { type EmailFilter } from "./EmailStatsPanel";
import LeadTable, { type JevInfo } from "./LeadTable";

export type { JevInfo };

export default function EmailDashboardClient({
  leads,
  sheetsOk = true,
  jev = {},
}: {
  leads: Lead[];
  sheetsOk?: boolean;
  jev?: Record<string, JevInfo>;
}) {
  const [emailFilter, setEmailFilter] = useState<EmailFilter>("all");

  return (
    <>
      <EmailStatsPanel leads={leads} activeFilter={emailFilter} onFilter={setEmailFilter} />
      <LeadTable leads={leads} emailFilter={emailFilter} sheetsOk={sheetsOk} jev={jev} />
    </>
  );
}

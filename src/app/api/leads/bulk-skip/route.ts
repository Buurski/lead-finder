import { NextResponse } from "next/server";
import { getLeads, updateLeadStatus } from "@/lib/sheets";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const leadIds: string[] = body.leadIds ?? [];

  if (leadIds.length === 0) {
    return NextResponse.json({ skipped: 0 });
  }

  const leads = await getLeads();
  const targets = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => leadIds.includes(lead.id));

  let skipped = 0;
  for (const { lead, rowIndex } of targets) {
    if (lead.status === "skip") continue;
    await updateLeadStatus(rowIndex, "skip");
    skipped++;
    await new Promise((r) => setTimeout(r, 200));
  }

  return NextResponse.json({ skipped });
}

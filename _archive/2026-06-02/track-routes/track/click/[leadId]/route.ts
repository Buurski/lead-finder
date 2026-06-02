import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const url = req.nextUrl.searchParams.get("url") ?? "/";
  try {
    const { leadId } = await params;
    const rowIndex = parseInt(leadId) - 2;
    if (!isNaN(rowIndex) && rowIndex >= 0) {
      const leads = await getLeads();
      const lead = leads[rowIndex];
      if (lead && !lead.emailClickedAt) {
        await updateLeadEmailStatus(rowIndex, {
          emailClickedAt: new Date().toISOString(),
          emailStatus: "clicked",
        });
      }
    }
  } catch {
    // Silently fail
  }
  return NextResponse.redirect(url);
}

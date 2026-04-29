import { NextRequest, NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";

const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64"
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { leadId: string } }
) {
  try {
    const rowIndex = parseInt(params.leadId) - 2;
    if (!isNaN(rowIndex) && rowIndex >= 0) {
      const leads = await getLeads();
      const lead = leads[rowIndex];
      if (lead && !lead.emailOpenedAt) {
        await updateLeadEmailStatus(rowIndex, {
          emailOpenedAt: new Date().toISOString(),
          emailStatus: "opened",
        });
      }
    }
  } catch {
    // Silently fail — never break email rendering
  }
  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

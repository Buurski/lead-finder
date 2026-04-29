import { NextRequest, NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { previewEmailTemplate } from "@/lib/email";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const type = (req.nextUrl.searchParams.get("type") ?? "cold") as "cold" | "followup";
  const leads = await getLeads();
  const { id } = await params;
  const rowIndex = parseInt(id) - 2;
  const lead = leads[rowIndex];
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const template = previewEmailTemplate(lead, type);
  return NextResponse.json(template);
}

import { NextResponse } from "next/server";
import { markBriefFilled, updateClientFolder } from "@/lib/sheets";
import { createClientProject, type BriefData } from "@/lib/folders";
import type { DeepResearch } from "@/app/api/leads/[id]/deep-research/route";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { deepResearch, ...briefFields } = body as BriefData & { deepResearch?: DeepResearch };
    const rowIndex = Number(id) - 2;

    const folderPath = createClientProject(briefFields as BriefData, deepResearch);
    await updateClientFolder(rowIndex, folderPath);
    await markBriefFilled(rowIndex);

    return NextResponse.json({ folderPath });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 });
  }
}

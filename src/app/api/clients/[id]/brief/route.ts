import { updateClientFolder, markBriefFilled } from "@/lib/sheets";
import { buildClaudeMd, type BriefData } from "@/lib/folders";
import type { DeepResearch } from "@/app/api/leads/[id]/deep-research/route";

export const maxDuration = 30;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { deepResearch, ...briefFields } = body as BriefData & { deepResearch?: DeepResearch };
    const rowIndex = Number(id) - 2;

    const content = buildClaudeMd(briefFields as BriefData, deepResearch);
    const fileName = `${(briefFields as BriefData).clientName.replace(/[^a-zA-Z0-9æøåÆØÅ\s-]/g, "").trim()}-CLAUDE.md`;

    await updateClientFolder(rowIndex, fileName);
    await markBriefFilled(rowIndex);

    return new Response(content, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: "Failed to create project" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

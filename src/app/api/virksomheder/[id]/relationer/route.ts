import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite, jsonBody, uuid } from "@/lib/hq/api";
import { addRelation, RelationError } from "@/lib/hq/relations";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async () => {
    const { id } = await ctx.params;
    const body = await jsonBody(req);
    if (body.label !== undefined && typeof body.label !== "string") throw new HqInputError("Ugyldigt mærkat");
    try {
      return await addRelation(getDb(), uuid(id), uuid(body.otherId, "andet virksomheds-id"), (body.label as string | undefined) ?? "");
    } catch (error) {
      if (error instanceof RelationError) throw new HqInputError(error.message);
      throw error;
    }
  });
}

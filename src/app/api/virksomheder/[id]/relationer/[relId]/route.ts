import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite, uuid } from "@/lib/hq/api";
import { removeRelation, RelationError } from "@/lib/hq/relations";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; relId: string }> }) {
  return hqWrite(req, async () => {
    const { id, relId } = await ctx.params;
    try {
      return await removeRelation(getDb(), uuid(id), uuid(relId, "relations-id"));
    } catch (error) {
      if (error instanceof RelationError) throw new HqInputError(error.message);
      throw error;
    }
  });
}

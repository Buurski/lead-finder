import { getDb } from "@/lib/db/client";
import { generate } from "@/lib/ai";
import { hqWrite, uuid } from "@/lib/hq/api";
import { draftCustomerUpdate } from "@/lib/hq/customer-updates";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST → kladde af kundeopdatering ud fra kunde-synligt arbejde (sendes aldrig herfra).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const update = await draftCustomerUpdate(getDb(), uuid(id, "virksomheds-id"), actor, async (prompt, system) =>
      (await generate({ task: "draft", prompt, system, maxTokens: 500, timeoutMs: 30_000 }))?.text ?? null,
    );
    return { update };
  });
}

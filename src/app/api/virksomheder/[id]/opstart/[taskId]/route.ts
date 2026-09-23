import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite, jsonBody, uuid } from "@/lib/hq/api";
import { OnboardingError, setOnboardingTaskDone } from "@/lib/hq/onboarding";

export const runtime = "nodejs";

// PATCH { done: boolean } — afkryds/genåbn ét punkt i opstarts-tjeklisten.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; taskId: string }> }) {
  return hqWrite(req, async () => {
    const { id, taskId } = await ctx.params;
    const companyId = uuid(id, "virksomheds-id");
    const tId = uuid(taskId, "opgave-id");
    const b = await jsonBody(req);
    if (typeof b.done !== "boolean") throw new HqInputError("done skal være sand/falsk");
    try {
      await setOnboardingTaskDone(getDb(), companyId, tId, b.done);
    } catch (err) {
      if (err instanceof OnboardingError) throw new HqInputError(err.message);
      throw err;
    }
    return { ok: true };
  });
}

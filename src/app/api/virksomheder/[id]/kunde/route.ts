import { getDb } from "@/lib/db/client";
import { HqInputError, hqWrite, uuid } from "@/lib/hq/api";
import { makeCustomer, OnboardingError } from "@/lib/hq/onboarding";
import { copenhagenNow } from "@/lib/settings";

export const runtime = "nodejs";

// POST → "Gør til kunde": tildeler næste kundenummer (idempotent), stopper åbne
// kolde kladder for virksomheden, og opretter opstarts-tjeklisten (kun første gang).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const companyId = uuid(id, "virksomheds-id");
    try {
      const clientNo = await makeCustomer(getDb(), companyId, { actor, today: copenhagenNow().date });
      return { clientNo };
    } catch (err) {
      if (err instanceof OnboardingError) throw new HqInputError(err.message);
      throw err;
    }
  });
}

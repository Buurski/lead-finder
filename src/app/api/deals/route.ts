import { getDb } from "@/lib/db/client";
import { createDeal } from "@/lib/hq/deals";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

// POST { companyId, title, stage?, valueDkk?, mrrDkk?, owner?, nextStep?, nextStepDue? }
export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const b = await jsonBody(req);
    return { deal: await createDeal(getDb(), uuid(b.companyId, "virksomheds-id"), b, actor) };
  });
}

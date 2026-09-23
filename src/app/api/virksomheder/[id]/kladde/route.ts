import { getDb } from "@/lib/db/client";
import { hqWrite, uuid } from "@/lib/hq/api";
import { draftForCompany } from "@/lib/hq/company-draft";

// POST /api/virksomheder/[id]/kladde — lægger en kold mail-kladde i godkendelsen. Sender intet.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return hqWrite(req, async (actor) => {
    const sender = actor === "charlie" ? "charlie" : "lucas";
    return draftForCompany(getDb(), uuid(id), sender);
  });
}

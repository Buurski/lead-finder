import { getDb } from "@/lib/db/client";
import { createLeadCompany, CreateCompanyError } from "@/lib/hq/create-company";
import { HqInputError, hqWrite, jsonBody } from "@/lib/hq/api";

export const runtime = "nodejs";

// POST { name, city?, phone?, email?, website? } — opret en virksomhed/lead
// manuelt fra CRM'et ("+ Ny" → Ny virksomhed). Bruges når hverken en Sheets-
// lead-række eller en henvendelse via kinly.dk (inbound.ts) har oprettet den.
export async function POST(req: Request) {
  return hqWrite(req, async () => {
    const b = await jsonBody(req);
    if (typeof b.name !== "string" || !b.name.trim()) throw new HqInputError("navn mangler");
    try {
      return await createLeadCompany(getDb(), {
        name: b.name,
        city: typeof b.city === "string" ? b.city : undefined,
        phone: typeof b.phone === "string" ? b.phone : undefined,
        email: typeof b.email === "string" ? b.email : undefined,
        website: typeof b.website === "string" ? b.website : undefined,
      });
    } catch (err) {
      if (err instanceof CreateCompanyError) throw new HqInputError(err.message);
      throw err;
    }
  });
}

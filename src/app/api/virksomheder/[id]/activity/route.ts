import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { activity, company } from "@/lib/db/schema";
import { HqInputError, hqWrite, jsonBody, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

const TYPES = new Set(["note", "opkald", "moede", "arbejde"]);

// POST { type: note|opkald|moede|arbejde, summary, billableDkk?, kundeSynlig? }
// "Log arbejde" med beløb bliver senere til fakturalinjer (fase 4).
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const companyId = uuid(id, "virksomheds-id");
    const b = await jsonBody(req);
    const type = String(b.type ?? "");
    if (!TYPES.has(type)) throw new HqInputError("ukendt type");
    const summary = typeof b.summary === "string" ? b.summary.trim() : "";
    if (!summary || summary.length > 2000) throw new HqInputError("tekst mangler eller er for lang");
    let billableDkk: number | null = null;
    if (b.billableDkk !== undefined && b.billableDkk !== null && b.billableDkk !== "") {
      const n = Number(b.billableDkk);
      if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) throw new HqInputError("beløb er ugyldigt");
      billableDkk = Math.round(n);
    }
    const db = getDb();
    const [c] = await db.select({ id: company.id }).from(company).where(eq(company.id, companyId));
    if (!c) throw new HqInputError("virksomheden findes ikke");
    const [row] = await db
      .insert(activity)
      .values({ companyId, actor, type, summary, billableDkk, payload: { kundeSynlig: b.kundeSynlig === true } })
      .returning();
    return { activity: row };
  });
}

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { company, site } from "@/lib/db/schema";
import { HqInputError, hqWrite, jsonBody, uuid } from "@/lib/hq/api";
import { SERVICES } from "@/lib/hq/overview";
import { canonicalClientName } from "@/lib/client-alias";
import { getSubscriptions, saveSubscriptions, validInvoiceLines, type Subscription } from "@/lib/invoices";
import { updateStamdata } from "@/lib/hq/stamdata";

export const runtime = "nodejs";

const SITE_STATUS = new Set(["demo", "in progress", "live", "pause"]);

function text(v: unknown, label: string, max = 200): string | null {
  if (v === undefined) return null;
  if (typeof v !== "string" || v.length > max) throw new HqInputError(`${label} er ugyldig`);
  return v.trim();
}

// PATCH { name?, phone?, email?, website?, city?, branch?, services?: string[], site?: { domain?, cmsUrl?, vercelProject?, status? }, aftale?: { lines, dayOfMonth, active } | null }
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    const companyId = uuid(id, "virksomheds-id");
    const b = await jsonBody(req);
    const db = getDb();
    const [co] = await db.select().from(company).where(eq(company.id, companyId));
    if (!co) throw new HqInputError("virksomheden findes ikke");

    if (b.name !== undefined || b.phone !== undefined || b.email !== undefined || b.website !== undefined || b.city !== undefined || b.branch !== undefined) {
      await updateStamdata(db, companyId, b, actor);
    }

    if (b.services !== undefined) {
      if (!Array.isArray(b.services) || b.services.some((s) => typeof s !== "string" || !(s in SERVICES))) throw new HqInputError("ukendt ydelse");
      await db.update(company).set({ services: [...new Set(b.services as string[])] }).where(eq(company.id, companyId));
    }

    if (b.site !== undefined) {
      const s = b.site as Record<string, unknown>;
      if (!s || typeof s !== "object") throw new HqInputError("site er ugyldig");
      const patch: Partial<typeof site.$inferInsert> = {};
      const domain = text(s.domain, "domæne");
      if (domain !== null) {
        if (domain && !/^[a-z0-9æøå.-]+\.[a-z]{2,}$/i.test(domain.replace(/^https?:\/\//, "").replace(/\/.*$/, ""))) throw new HqInputError("domæne er ugyldigt");
        patch.domain = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "") || null;
      }
      const cms = text(s.cmsUrl, "CMS-link", 300);
      if (cms !== null) {
        if (cms && !/^https:\/\//i.test(cms)) throw new HqInputError("CMS-link skal starte med https://");
        patch.cmsUrl = cms || null;
      }
      const vp = text(s.vercelProject, "Vercel-projekt", 100);
      if (vp !== null) patch.vercelProject = vp || null;
      const st = text(s.status, "status", 30);
      if (st !== null) {
        if (!SITE_STATUS.has(st)) throw new HqInputError("ukendt site-status");
        patch.status = st;
      }
      const [existing] = await db.select({ id: site.id }).from(site).where(eq(site.companyId, companyId)).limit(1);
      if (existing) await db.update(site).set(patch).where(eq(site.id, existing.id));
      else await db.insert(site).values({ companyId, ...patch });
    }

    if (b.aftale !== undefined) {
      const want = canonicalClientName(co.name);
      const subs = await getSubscriptions();
      const rest = subs.filter((s) => canonicalClientName(s.clientName) !== want);
      if (b.aftale === null) {
        await saveSubscriptions(rest);
      } else {
        const a = b.aftale as Record<string, unknown>;
        if (!validInvoiceLines(a.lines)) throw new HqInputError("hver linje skal have tekst og et beløb over 0");
        const day = Number(a.dayOfMonth ?? 1);
        if (!Number.isInteger(day) || day < 1 || day > 28) throw new HqInputError("dag i måneden skal være 1–28");
        const current = subs.find((s) => canonicalClientName(s.clientName) === want);
        const next: Subscription = { clientName: current?.clientName ?? co.name, lines: a.lines, dayOfMonth: day, active: a.active !== false };
        await saveSubscriptions([...rest, next]);
      }
    }
    return { ok: true };
  });
}

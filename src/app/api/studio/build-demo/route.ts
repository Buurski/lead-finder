import { NextResponse } from "next/server";
import { reconCustomer, saveRecon } from "@/lib/customer-recon";
import { buildDemo } from "@/lib/demo-factory";

// POST /api/studio/build-demo { name, branch, url } — recon + build a static
// HTML demo into dist/demo-{slug}/. Returns the HTML (for an inline preview),
// the generated design.md, and the local path. Never auto-deploys to Vercel —
// that stays Lucas's manual step.
export const dynamic = "force-dynamic";
export const maxDuration = 40;

export async function POST(req: Request) {
  let name = "", branch = "", url = "";
  try {
    const b = await req.json();
    name = String(b.name ?? "").trim();
    branch = String(b.branch ?? "").trim();
    url = String(b.url ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const recon = await reconCustomer(url || name, name);
    try { await saveRecon(recon); } catch { /* asset store is best-effort */ }
    const build = await buildDemo(name, branch || recon.slug, recon, { persist: true, requireMinData: true });
    if (!build) {
      return NextResponse.json(
        { ok: false, error: "recon fandt for lidt indhold på siden — angiv en branche eller en side med mere indhold", recon },
        { status: 422 },
      );
    }
    return NextResponse.json({
      ok: true,
      slug: build.slug,
      template: build.template.label,
      demoPath: build.demoPath,
      designMd: build.designMd,
      html: build.html,
      note: "demo skrevet lokalt — deploy til Vercel er dit eget skridt",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { runSeoChecks } from "@/lib/seo";
import { generateSeoReport } from "@/lib/seo-report";

// POST /api/seo/check { name, city?, domain } — run the SEO checks for one
// client and return the structured result + a markdown report. Read-only:
// fetches public pages, writes nothing back.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  let name = "", city = "", domain = "";
  try {
    const b = await req.json();
    name = String(b.name ?? "").trim();
    city = String(b.city ?? "").trim();
    domain = String(b.domain ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  try {
    const result = await runSeoChecks({ name, city, domain });
    return NextResponse.json({ ok: true, result, report: generateSeoReport(result) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

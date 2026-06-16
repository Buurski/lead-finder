import { NextResponse } from "next/server";
import { reconFull, loadReconFull, type FullReconInput } from "@/lib/customer-recon-full";
import { slugify } from "@/lib/customer-recon";

// POST /api/studio/recon-full { name, branch, websiteUrl?, gmbUrl?, igNotes? }
// Runs a full multi-source recon (website + optional GMB), merges, caches 24h.
// Read-mostly (writes only the recon cache); same trust level as /api/studio/recon.
export const dynamic = "force-dynamic";
export const maxDuration = 40;

export async function POST(req: Request) {
  let b: Partial<FullReconInput> & { force?: boolean };
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const name = String(b.name ?? "").trim();
  const branch = String(b.branch ?? "").trim();
  if (!name && !b.websiteUrl) {
    return NextResponse.json({ error: "name eller websiteUrl påkrævet" }, { status: 400 });
  }

  const slug = slugify(name || String(b.websiteUrl));
  if (!b.force) {
    const cached = await loadReconFull(slug);
    if (cached) return NextResponse.json({ ok: true, cached: true, recon: cached });
  }

  const recon = await reconFull({
    name,
    branch,
    websiteUrl: b.websiteUrl?.trim() || undefined,
    gmbUrl: b.gmbUrl?.trim() || undefined,
    igNotes: b.igNotes?.trim() || undefined,
  });
  return NextResponse.json({ ok: true, cached: false, recon });
}

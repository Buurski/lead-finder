import { NextResponse } from "next/server";
import { reconCustomer } from "@/lib/customer-recon";

// POST /api/studio/recon { url, name } — read-only recon preview. Fetches the
// customer's existing site and returns a visual/tonal fingerprint. Writes nothing.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  let url = "", name = "";
  try {
    const b = await req.json();
    url = String(b.url ?? "").trim();
    name = String(b.name ?? "").trim();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!url && !name) return NextResponse.json({ error: "url or name required" }, { status: 400 });

  const recon = await reconCustomer(url || name, name || undefined);
  return NextResponse.json({ ok: true, recon });
}

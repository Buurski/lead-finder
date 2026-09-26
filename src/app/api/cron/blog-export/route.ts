import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { ctEqual } from "@/lib/cc-auth";
import { confirmPublished, exportablePosts } from "@/lib/hq/blog-export";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Udgiveren i kinly-site (.github/workflows/blog-publish.yml) med egen hemmelighed —
// ikke CRON_SECRET, så GitHub kun kan læse Publicer-kort og melde dem live.
function authorized(req: Request): boolean {
  const secret = process.env.BLOG_EXPORT_SECRET;
  return Boolean(secret) && ctEqual(req.headers.get("authorization") || "", `Bearer ${secret}`);
}

// GET → kort i Publicer med grøn tjekliste, færdigkonverteret til kinly.dk-format.
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!pgEnabled()) return NextResponse.json({ ok: true, items: [], skipped: [] });
  return NextResponse.json({ ok: true, ...(await exportablePosts(getDb())) });
}

// POST { id, url } → HQ henter selv url'en (200 = live) og flytter kortet til Udgivet.
export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { id?: unknown; url?: unknown } | null;
  if (!b || typeof b.id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.id)) return NextResponse.json({ ok: false, error: "id mangler" }, { status: 400 });
  try {
    const post = await confirmPublished(getDb(), b.id, b.url);
    return NextResponse.json({ ok: true, stage: post.stage, url: post.publishedUrl });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}

import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const keys = await store.listAssets("demos/");
    const slugs = [...new Set(keys.map((k) => k.match(/^demos\/([^/]+)\//)?.[1]).filter(Boolean))];
    return NextResponse.json({ ok: true, demos: slugs.map((s) => ({ slug: s, url: "/demo/" + s })) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e), demos: [] });
  }
}

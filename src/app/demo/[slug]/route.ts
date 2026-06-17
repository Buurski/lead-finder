import { store } from "@/lib/store";
import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const key = `demos/${slug}/index.html`;
  const url = await store.getAssetUrl(key);
  if (url && /^https?:\/\//i.test(url)) return Response.redirect(url, 302);
  try {
    const html = fs.readFileSync(path.join(process.cwd(), "dist", key), "utf-8");
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  } catch {
    return new Response("demo ikke fundet", { status: 404 });
  }
}

import fs from "node:fs";
import path from "node:path";
import { readPreviewRequests } from "@/lib/preview-queue";

export const dynamic = "force-dynamic";

// Public customer demo route. It deliberately has no overview/index route.
// A demo key is required, so knowing another slug is not enough to open it.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return new Response("ugyldigt slug", { status: 400 });
  const key = new URL(req.url).searchParams.get("key");
  if (!key || key.length < 12) return new Response("demo-link ugyldigt", { status: 404 });

  const requests = await readPreviewRequests();
  const allowed = requests.some((request) => {
    if (request.demoKey !== key || !request.previewUrl) return false;
    try { return new URL(request.previewUrl).pathname.endsWith(`/studio/demo-site/${slug}`); } catch { return false; }
  });
  if (!allowed) return new Response("demo-link ugyldigt", { status: 404 });

  try {
    const html = fs.readFileSync(
      path.join(process.cwd(), "demo-sites", slug, "index.html"),
      "utf-8",
    );
    return new Response(html, {
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("demo ikke fundet", { status: 404 });
  }
}

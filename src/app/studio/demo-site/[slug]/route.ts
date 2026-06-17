import fs from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

// Serves the committed single-file demos under demo-sites/<slug>/index.html.
// These are the hand-built Studio demos (distinct from the store/dist-served
// prompt-gen demos at /demo/<slug>). Kept on the filesystem so they deploy with
// the repo; next.config outputFileTracingIncludes bundles them into the function.
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9-]+$/.test(slug)) return new Response("ugyldigt slug", { status: 400 });
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

// GET /api/seo-tjek/unsubscribe?id=<uuid> — one-click opt-out linked from every
// funnel mail. GET-with-side-effect is the accepted pattern for mail
// unsubscribe links (idempotent: repeat clicks are no-ops). Public route.

import { NextRequest } from "next/server";
import { store } from "@/lib/store";
import { bumpStats, SUB_PREFIX, type SeoTjekSubmission } from "@/lib/seo-tjek";

export const dynamic = "force-dynamic";

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:4rem auto;padding:0 1.25rem;color:#1f2937;line-height:1.6">
<h1 style="font-size:1.5rem">${title}</h1><p>${body}</p>
</body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" } },
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return page("Ugyldigt link", "Afmeldingslinket er ikke gyldigt. Skriv til os, så fjerner vi dig manuelt.");
  }
  const sub = await store.get<SeoTjekSubmission>(`${SUB_PREFIX}${id}`);
  if (!sub) {
    // Don't reveal whether an id exists — same friendly answer either way.
    return page("Du er afmeldt", "Du hører ikke mere fra os.");
  }
  if (!sub.unsubscribedAt) {
    sub.unsubscribedAt = new Date().toISOString();
    await store.put(`${SUB_PREFIX}${id}`, sub);
    await bumpStats("unsubscribes");
  }
  return page("Du er afmeldt", "Du hører ikke mere fra os. Tak fordi du prøvede det gratis SEO-tjek.");
}

// /seo-tjek/rapport/[id] — public report view. Raw HTML route handler (same
// pattern as /demo/[slug]): the report id is an unguessable UUID mailed to the
// requester, so the page itself needs no login. Print CSS in the report makes
// the browser's "Gem som PDF" produce a clean PDF — deliberately no PDF lib.

import { store } from "@/lib/store";
import { renderReportHtml, REPORT_PREFIX, type SeoTjekReport } from "@/lib/seo-tjek";

export const dynamic = "force-dynamic";

const NOT_FOUND_HTML = `<!doctype html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rapport ikke fundet</title></head>
<body style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:560px;margin:4rem auto;padding:0 1.25rem;color:#1f2937">
<h1>Rapporten findes ikke</h1>
<p>Linket er forkert, eller rapporten er udløbet. Du kan altid køre et nyt gratis tjek:</p>
<p><a href="/seo-tjek" style="color:#4a7c59;font-weight:700">Kør et nyt SEO-tjek</a></p>
</body></html>`;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  // UUID only — anything else is someone probing the store namespace.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response(NOT_FOUND_HTML, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const report = await store.get<SeoTjekReport>(`${REPORT_PREFIX}${id}`);
  if (!report) {
    return new Response(NOT_FOUND_HTML, { status: 404, headers: { "content-type": "text/html; charset=utf-8" } });
  }
  const bookingUrl = (process.env.SEO_TJEK_BOOKING_URL || "").trim() || undefined;
  let html = renderReportHtml(report, { standalone: true, bookingUrl });
  // "Gem som PDF" — a small print button injected above the report.
  html = html.replace(
    "<body>",
    `<body><div class="noprint" style="max-width:720px;margin:0 auto;padding:1rem 1.25rem 0;text-align:right"><button onclick="window.print()" style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:.45rem .9rem;cursor:pointer;font-size:.85rem">Gem som PDF</button></div>`,
  );
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" },
  });
}

// Selve rapporten til én kunde for én måned: HTML (standard) eller ?format=pdf.
// Bag proxyens login som resten af HQ; authorizedRead er en ekstra vagt.
import { getDb } from "@/lib/db/client";
import { authorizedRead } from "@/lib/hq/api";
import { KundeRapportError, rapportFor, tjekHost, tjekMaaned } from "@/lib/hq/kunde-rapport";
import { renderKundeRapportHtml } from "@/lib/hq/kunde-rapport-html";
import { renderKundeRapportPdf } from "@/lib/kunde-rapport-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ domaene: string; maaned: string }> }) {
  if (!(await authorizedRead(req))) return new Response("Ikke logget ind", { status: 401 });
  const p = await ctx.params;
  let host: string, ym: string;
  try {
    host = tjekHost(p.domaene); // Next har allerede dekodet parameteren
    ym = tjekMaaned(p.maaned);
  } catch (err) {
    if (err instanceof KundeRapportError) return new Response(err.message, { status: 400 });
    throw err;
  }
  const r = await rapportFor(getDb(), host, ym);
  if (!r) return new Response(`Der er ingen sendbar måling for ${host} i ${ym}.`, { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const headers = { "cache-control": "private, no-store", "x-robots-tag": "noindex" };
  if (new URL(req.url).searchParams.get("format") === "pdf") {
    const pdf = await renderKundeRapportPdf(r);
    const navn = `kinly-rapport-${host.replace(/\./g, "-")}-${ym}.pdf`;
    return new Response(new Uint8Array(pdf), { headers: { ...headers, "content-type": "application/pdf", "content-disposition": `inline; filename="${navn}"` } });
  }
  return new Response(renderKundeRapportHtml(r), { headers: { ...headers, "content-type": "text/html; charset=utf-8" } });
}

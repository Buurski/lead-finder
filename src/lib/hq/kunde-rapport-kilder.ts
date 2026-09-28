// Eksterne kilder til månedsrapporten: kundens logo og Google-anmeldelser.
// Eget modul uden DB-importer, så det kan køres og testes uden database.
import { store } from "../store.ts";
import { hostAf } from "./kunde-rapport-model.ts";

const keyLogo = (host: string, ym: string) => `kunderapport/logo/${host}/${ym}`;

/** Kundens eget mærke til rapportens forside, som data-URI (PNG/JPEG, så react-pdf kan vise det).
 *  Kilde: apple-touch-icon, ellers største PNG/SVG-ikon. Ikke "<img> med logo i navnet": på
 *  Ikast er det Bosch-mærket, ikke kundens. Caches pr. måned; fejl = null = ingen logo. */
export async function logoFor(host: string, ym: string): Promise<string | null> {
  const cached = await store.get<{ v: string | null }>(keyLogo(host, ym));
  if (cached) return cached.v;
  let v: string | null = null;
  try {
    const side = `https://${host}/`;
    const html = await (await fetch(side, { headers: { "User-Agent": "Mozilla/5.0 (KinlyRapport)" }, signal: AbortSignal.timeout(8000) })).text();
    const links = [...html.matchAll(/<link\b[^>]*>/gi)].map((m) => m[0]);
    const attr = (tag: string, a: string) => tag.match(new RegExp(`\\b${a}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1] ?? "";
    const stoerrelse = (tag: string) => Math.max(0, ...attr(tag, "sizes").split(/\s+/).map((s) => Number(s.split("x")[0]) || 0));
    const kandidater = [
      ...links.filter((l) => /apple-touch-icon/i.test(attr(l, "rel"))),
      ...links
        .filter((l) => /(^|\s)icon(\s|$)/i.test(attr(l, "rel")) && /\.(png|svg|jpe?g|webp)(\?|$)/i.test(attr(l, "href")))
        .sort((a, b) => stoerrelse(b) - stoerrelse(a)),
    ];
    for (const tag of kandidater) {
      const res = await fetch(new URL(attr(tag, "href"), side), { signal: AbortSignal.timeout(8000) });
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !type.startsWith("image/")) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 1_000_000) continue;
      if (/png|jpe?g/.test(type)) v = `data:${type.split(";")[0]};base64,${buf.toString("base64")}`;
      else {
        // SVG/WebP → PNG. sharp følger med Next; mangler den, springer vi logoet over.
        const sharp = (await import("sharp")).default;
        v = `data:image/png;base64,${(await sharp(buf, { density: 300 }).resize(256, 256, { fit: "inside" }).png().toBuffer()).toString("base64")}`;
      }
      break;
    }
  } catch {
    return null; // netfejl caches ikke
  }
  await store.put(keyLogo(host, ym), { v });
  return v;
}

const keyA = (host: string, ym: string) => `kunderapport/anmeldelser/${host}/${ym}`;

/** Friske Google-anmeldelser via Places (samme nøgle som lead-research). Hentes én gang pr.
 *  kunde pr. måned og caches i KV, så HQ-sidevisninger ikke koster et API-kald hver gang.
 *  Ingen nøgle, intet svar eller fejl = null: så nævner rapporten slet ikke anmeldelser. */
export async function anmeldelserFor(k: { name: string; placeId: string | null }, host: string, ym: string): Promise<{ rating: number | null; antal: number } | null> {
  const cached = await store.get<{ v: { rating: number | null; antal: number } | null }>(keyA(host, ym));
  if (cached) return cached.v;
  const key = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!key) return null;
  let v: { rating: number | null; antal: number } | null = null;
  try {
    const res = k.placeId
      ? await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(k.placeId)}`, {
          headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount" },
          signal: AbortSignal.timeout(8000),
        })
      : await fetch("https://places.googleapis.com/v1/places:searchText", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.rating,places.userRatingCount,places.websiteUri" },
          body: JSON.stringify({ textQuery: k.name, languageCode: "da", regionCode: "DK", maxResultCount: 3 }),
          signal: AbortSignal.timeout(8000),
        });
    if (res.ok) {
      const j = (await res.json()) as { rating?: number; userRatingCount?: number; places?: { rating?: number; userRatingCount?: number; websiteUri?: string }[] };
      // Navnesøgning: kun et sted hvis hjemmeside er kundens, ellers kan det være et andet firma.
      const p = k.placeId ? j : j.places?.find((x) => x.websiteUri && hostAf(x.websiteUri) === host);
      if (p && typeof p.userRatingCount === "number") v = { rating: typeof p.rating === "number" ? p.rating : null, antal: p.userRatingCount };
    }
  } catch {
    return null; // netfejl caches ikke; næste visning prøver igen
  }
  await store.put(keyA(host, ym), { v });
  return v;
}

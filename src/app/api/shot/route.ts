// Skærmbillede af en virksomheds forside til /kunder-kortene. thum.io (gratis) svarer
// ustabilt med et "Image not authorized"-billede når browseren sender Referer — og det
// kan klienten ikke skelne fra et rigtigt skud (samme mål). Serveren henter uden Referer,
// afviser svar under MIN_BYTES (afvisningsbilledet er ~7 KB). Kun et godt skud caches (i browseren, en uge) — en afvisning må ikke hænge fast.
// Bag login (proxy.ts), og kun domænenavne — ingen åben proxy.
import { NextResponse, type NextRequest } from "next/server";

const DOMAIN = /^(?=.{3,253}$)([a-z0-9-]{1,63}\.)+[a-z]{2,24}$/;
const MIN_BYTES = 20_000;
const WEEK = 60 * 60 * 24 * 7;

export async function GET(req: NextRequest) {
  const d = (req.nextUrl.searchParams.get("d") ?? "").trim().toLowerCase();
  if (!DOMAIN.test(d)) return new NextResponse(null, { status: 400 });
  const res = await fetch(`https://image.thum.io/get/width/800/crop/600/https://${d}`, { cache: "no-store" }).catch(() => null);
  const buf = res?.ok ? await res.arrayBuffer() : null;
  if (!buf || buf.byteLength < MIN_BYTES) return new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });
  return new NextResponse(buf, {
    headers: { "Content-Type": res!.headers.get("content-type") ?? "image/png", "Cache-Control": `private, max-age=${WEEK}` },
  });
}

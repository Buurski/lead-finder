// "Skriv tekster" i Annonce-studiet: { slug, vinkel? } -> { forslag } (gemmes IKKE; Lucas vælger og gemmer via
// /api/marketing/annoncer action "tekster"). hqWrite = login + Origin-tjek. AI utilgængelig -> 503 med tydelig besked.
import { NextResponse } from "next/server";
import { hqWrite, jsonBody } from "@/lib/hq/api";
import { loadAnnoncer } from "@/lib/hq/annoncer";
import { AiUtilgaengelig, foreslaaTekster } from "@/lib/hq/annonce-tekster-ai";
import { StudieInputError } from "@/lib/hq/annonce-studie-types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: Request) {
  let utilg = "";
  const res = await hqWrite(req, async () => {
    const b = await jsonBody(req);
    const a = loadAnnoncer().find((x) => x.slug === b.slug);
    if (!a) throw new StudieInputError("Ukendt annonce.");
    const vinkel = typeof b.vinkel === "string" ? b.vinkel.trim().slice(0, 200) : "";
    try {
      return { forslag: await foreslaaTekster(a, vinkel) };
    } catch (err) {
      if (err instanceof AiUtilgaengelig) {
        utilg = err.message;
        return {};
      }
      throw err;
    }
  });
  return utilg ? NextResponse.json({ error: utilg }, { status: 503 }) : res;
}

// Godkend / drop / nulstil et annonce-motiv (/marketing/annoncer). hqWrite = login + Origin-tjek.
//   { slug, status: "godkendt" | "droppet" | "afventer" }  ->  { beslutninger }
// Gemmes som en append-only log i `store` (lokalt .send_queue/, på Vercel KV). HQ sender intet til Meta.
import { hqWrite, jsonBody } from "@/lib/hq/api";
import { setBeslutning } from "@/lib/hq/annoncer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const body = await jsonBody(req);
    return { beslutninger: await setBeslutning(body.slug, body.status, actor) };
  });
}

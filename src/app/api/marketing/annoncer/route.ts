// Annonce-studiet (/marketing/annoncer). hqWrite = login + Origin-tjek. HQ sender intet til Meta.
//   { action?: "beslutning", slug, status: "godkendt" | "droppet" | "afventer" }  ->  { beslutninger }
//   { action: "kundeJa", kunde, ja: boolean, note }                               ->  { kundeJa }
//   { action: "tekster", gruppe, overskrifter[], primaere[], fakta_id[], kilde? } ->  { tekster }
//   { action: "testOpret", navn, hypotese, start, arme[] }                         ->  { tests }
//   { action: "testResultat", id, slug, fra, til, forbrug, visninger, klik, leads, kvalificerede, kunder } -> { tests }
//   { action: "testFortryd", id, rid } · { action: "testAfslut", id, vinder|null, note }  ->  { tests }
//   { action: "bestil", gruppe, skaerme[], onske } · { action: "bestillingStatus", id, status, note }  ->  { bestillinger }
// Alt gemmes som append-only logs i `store` (lokalt .send_queue/, på Vercel KV).
import { hqWrite, jsonBody } from "@/lib/hq/api";
import {
  afslutTest, bestil, fortrydResultat, gemTekster, opretTest, setBeslutning, setBestillingStatus, setKundeJa, tilfoejResultat,
} from "@/lib/hq/annoncer";
import { StudieInputError } from "@/lib/hq/annonce-studie-types";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const b = await jsonBody(req);
    switch (b.action ?? "beslutning") {
      case "beslutning": return { beslutninger: await setBeslutning(b.slug, b.status, actor) };
      case "kundeJa": return { kundeJa: await setKundeJa(b.kunde, b.ja, b.note, actor) };
      case "tekster": return { tekster: await gemTekster(b.gruppe, b, b.kilde === "ai" ? "ai" : "manuel", actor) };
      case "testOpret": return { tests: await opretTest(b, actor) };
      case "testResultat": return { tests: await tilfoejResultat(b, actor) };
      case "testFortryd": return { tests: await fortrydResultat(b.id, b.rid, actor) };
      case "testAfslut": return { tests: await afslutTest(b.id, b.vinder ?? null, b.note, actor) };
      case "bestil": return { bestillinger: await bestil(b, actor) };
      case "bestillingStatus": return { bestillinger: await setBestillingStatus(b.id, b.status, b.note, actor) };
      default: throw new StudieInputError("Ukendt handling.");
    }
  });
}

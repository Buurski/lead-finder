// Agent-vejen for månedsrapporten: VPS'ens kunde_seo_tjek.py lægger sin måling
// her efter hver SENDBAR kørsel. Samme HMAC-skema som de andre /api/agent-ruter.
//   POST { action: "maaling", maaling: <motorens JSON> } → { ok, domaene, maaned, overskrev }
//   POST { action: "kunder" } → { ok, kunder: [{ navn, domaene, url }] }  (hvem der skal måles)
// Gaten (status_flag ok + kan_sendes) håndhæves igen i kunde-rapport.ts, så en
// blokeret kørsel aldrig kan blive til tal i en kunderapport.
//
// Ingen "next/server"-import: route.test.ts kalder handleren direkte under
// node:test. Undtaget fra proxyens login (api/agent/-præfikset); ruten
// beskytter sig selv.
import { gemMaaling, KundeRapportError, kunderTilMaaling } from "../../../../lib/hq/kunde-rapport.ts";
import { getDb } from "../../../../lib/db/client.ts";
import { verifyHermesRequest } from "../../../../lib/hermes-hmac.ts";
import { cleanEnv } from "../../../../lib/hermes.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status });

const MAX_BODY = 200_000;

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > MAX_BODY) return json({ ok: false, error: "for stor" }, 413);
  if (!verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  let input: { action?: unknown; maaling?: unknown };
  try {
    input = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "ugyldig JSON" }, 400);
  }
  // Hvem skal måles denne måned: fra CRM (ydelsen "seo"), så nye kunder kommer med af sig selv.
  if (input.action === "kunder") return json({ ok: true, kunder: await kunderTilMaaling(getDb()) });
  if (input.action !== "maaling") return json({ ok: false, error: "ukendt action — brug maaling eller kunder" }, 400);
  try {
    return json({ ok: true, ...(await gemMaaling(input.maaling)) });
  } catch (err) {
    if (err instanceof KundeRapportError) return json({ ok: false, error: err.message }, 422);
    console.error(JSON.stringify({ evt: "agent.kunde-rapport.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

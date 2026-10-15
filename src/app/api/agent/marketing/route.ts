// Agent-vejen til Marketing (/marketing) — samme HMAC-skema som /api/agent/posts:
//   X-Timestamp: <unix-sek>   Authorization: Bearer hmac(secret, `${ts}.${METHOD}.${path}.${body}`)
//   GET  /api/agent/marketing[?status=kladde|godkendt|postet|droppet]  → { ok, drafts, tests }
//   POST /api/agent/marketing { ...kladde }                             → { ok, draft }  (status ALTID "kladde")
// Agenten kan aldrig godkende, droppe, prioritere, planlægge, markere postet eller sætte
// Charlies/kundens ok: de felter afvises (400), og rutens eneste skriveeffekt er en kladde.
// Undtaget fra proxyens login (api/agent/-præfikset); ruten beskytter sig selv.
// Ingen "next/server"-import: route.test.ts kalder handleren direkte under node:test.
import { getDb, pgEnabled } from "../../../../lib/db/client.ts";
import { CompetitorInputError } from "../../../../lib/hq/competitors.ts";
import { createDraft, listDrafts, listRefs } from "../../../../lib/hq/marketing.ts";
import { DRAFT_STATUSES } from "../../../../lib/hq/marketing-types.ts";
import { verifyHermesRequest } from "../../../../lib/hermes-hmac.ts";
import { cleanEnv } from "../../../../lib/hermes.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const MAX_BODY = 120_000; // et manus kan fylde op mod 60.000 tegn

function gate(req: Request, body: string): Response | null {
  if (!verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!pgEnabled()) return json({ ok: false, error: "CRM kører ikke på Postgres" }, 503);
  return null;
}

export async function GET(req: Request) {
  const denied = gate(req, "");
  if (denied) return denied;
  const status = new URL(req.url).searchParams.get("status");
  if (status && !(DRAFT_STATUSES as readonly string[]).includes(status)) return json({ ok: false, error: "ukendt status" }, 400);
  try {
    const db = getDb();
    const drafts = (await listDrafts(db)).filter((d) => !status || d.status === status);
    const tests = (await listRefs(db, "ab")).map((t) => ({ id: t.id, title: t.title, status: t.status, arms: (t.data as { arms?: unknown }).arms ?? null }));
    return json({ ok: true, drafts, tests });
  } catch (err) {
    console.error(JSON.stringify({ evt: "agent.marketing.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > MAX_BODY) return json({ ok: false, error: "for stor" }, 413);
  const denied = gate(req, body);
  if (denied) return denied;
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "ugyldig JSON" }, 400);
  }
  try {
    // Aktør tvinges til "hermes"; createDraft(…, "agent") afviser alle menneske-felter.
    return json({ ok: true, draft: await createDraft(getDb(), input, "hermes", "agent") });
  } catch (err) {
    if (err instanceof CompetitorInputError) return json({ ok: false, error: err.message }, 400);
    console.error(JSON.stringify({ evt: "agent.marketing.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

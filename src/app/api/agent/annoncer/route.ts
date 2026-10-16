// Agent-vejen til Annonce-studiet — samme HMAC-skema som /api/agent/marketing (HERMES_API_SECRET):
//   GET  /api/agent/annoncer  → { ok, godkendte, tests (med vurdering + stopregler), bestillinger (status "ny") }
//   POST /api/agent/annoncer  { action: "bestillingStatus", id, status: "lavet" | "afvist", note }  → { ok, bestillinger }
// Agenten kan ALDRIG godkende annoncer, sætte kunde-ja, oprette/afslutte tests, indtaste resultater eller ændre tekster:
// det findes kun på menneske-ruten /api/marketing/annoncer. Hermes læser, anbefaler på Telegram og markerer bestillinger.
// Undtaget fra proxyens login (api/agent/-præfikset); ruten beskytter sig selv.
// Ingen "next/server"-import: route.test.ts kalder handleren direkte under node:test.
import { setBestillingStatus, studieOversigt } from "../../../../lib/hq/annoncer.ts";
import { StudieInputError } from "../../../../lib/hq/annonce-studie-types.ts";
import { verifyHermesRequest } from "../../../../lib/hermes-hmac.ts";
import { cleanEnv } from "../../../../lib/hermes.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const MAX_BODY = 4_000;
const ok = (req: Request, body: string) => verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body);

export async function GET(req: Request) {
  if (!ok(req, "")) return json({ ok: false, error: "unauthorized" }, 401);
  return json({ ok: true, ...(await studieOversigt()) });
}

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > MAX_BODY) return json({ ok: false, error: "for stor" }, 413);
  if (!ok(req, body)) return json({ ok: false, error: "unauthorized" }, 401);
  let b: Record<string, unknown>;
  try {
    const p = JSON.parse(body) as unknown;
    if (!p || typeof p !== "object" || Array.isArray(p)) throw new Error();
    b = p as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "ugyldig JSON" }, 400);
  }
  try {
    if (b.action !== "bestillingStatus") throw new StudieInputError("Agenten må kun markere bestillinger.");
    if (b.status !== "lavet" && b.status !== "afvist") throw new StudieInputError("status skal være lavet eller afvist");
    return json({ ok: true, bestillinger: await setBestillingStatus(b.id, b.status, b.note, "hermes") });
  } catch (err) {
    if (err instanceof StudieInputError) return json({ ok: false, error: err.message }, 400);
    console.error(JSON.stringify({ evt: "agent.annoncer.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

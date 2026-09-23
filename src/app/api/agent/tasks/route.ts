// Ingen "next/server"-import: route.test.ts kalder handleren direkte under
// node:test, og node kan ikke resolve Next's subpath-eksport. Plain Response er
// samme svar-objekt som NextResponse.json giver.
import { getDb, pgEnabled } from "../../../../lib/db/client.ts";
import { DealInputError } from "../../../../lib/hq/deals.ts";
import { completeTask, createTask, listMyDay, patchTask, type Owner } from "../../../../lib/hq/tasks.ts";
import { verifyHermesRequest } from "../../../../lib/hermes-hmac.ts";
import { cleanEnv } from "../../../../lib/hermes.ts";
import { copenhagenNow } from "../../../../lib/settings.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function person(v: unknown, label: string): Owner {
  const s = String(v ?? "").toLowerCase();
  if (s !== "lucas" && s !== "charlie") throw new DealInputError(`ukendt ${label}`);
  return s;
}

function taskId(v: unknown): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new DealInputError("ugyldigt opgave-id");
  return v;
}

// POST { actor, action: create|update|complete|list, ... } — HQ-opgaver (samme
// HMAC-skema som /api/agent/log). Undtaget fra proxyens login.
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 4000) return json({ ok: false, error: "for stor" }, 413);
  if (!verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!pgEnabled()) return json({ ok: false, error: "CRM kører ikke på Postgres" }, 503);
  let input: { actor?: unknown; action?: unknown; title?: unknown; owner?: unknown; due?: unknown; companyId?: unknown; id?: unknown; fields?: unknown };
  try {
    input = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "ugyldig JSON" }, 400);
  }
  try {
    const actor = person(input.actor, "actor");
    const action = typeof input.action === "string" ? input.action : "";
    switch (action) {
      case "create": {
        // owner udeladt = opgaven er aktørens egen (validOwner i tasks.ts kræver en værdi).
        const task = await createTask(getDb(), { title: input.title, due: input.due, owner: input.owner ?? actor, companyId: input.companyId });
        return json({ ok: true, task });
      }
      case "update": {
        const task = await patchTask(getDb(), taskId(input.id), (input.fields ?? {}) as never, actor);
        return json({ ok: true, task });
      }
      case "complete": {
        const task = await completeTask(getDb(), taskId(input.id), actor);
        return json({ ok: true, task });
      }
      case "list": {
        const items = await listMyDay(getDb(), { today: copenhagenNow().date, owner: input.owner ? person(input.owner, "ejer") : undefined });
        return json({ ok: true, items });
      }
      default:
        return json({ ok: false, error: "ukendt action" }, 400);
    }
  } catch (err) {
    if (err instanceof DealInputError) return json({ ok: false, error: err.message }, 400);
    console.error(JSON.stringify({ evt: "agent.tasks.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

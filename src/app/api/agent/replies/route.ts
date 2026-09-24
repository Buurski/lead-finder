// Svar-indbakken (Svar-digesten) via den signerede agent-vej:
//   action "handle"  { itemId } → fjern meddelelsen helt (skjules i alle visninger)
//   action "refresh" {}         → kør frisk live-scan og gem oversigten (hvis den fandt noget)
// Samme HMAC-skema som /api/agent/tasks. Undtaget fra proxyens login.
import { markItemHandled, saveDigest, summarizeDigest } from "../../../../lib/inbox-digest.ts";
import { liveScanDigest } from "../../../../lib/inbox-live.ts";
import { verifyHermesRequest } from "../../../../lib/hermes-hmac.ts";
import { cleanEnv } from "../../../../lib/hermes.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status });

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 4000) return json({ ok: false, error: "for stor" }, 413);
  if (!verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  let input: { action?: unknown; itemId?: unknown };
  try {
    input = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "ugyldig JSON" }, 400);
  }
  try {
    switch (typeof input.action === "string" ? input.action : "") {
      case "handle": {
        const itemId = typeof input.itemId === "string" ? input.itemId.trim() : "";
        if (!itemId || itemId.length > 128) return json({ ok: false, error: "ugyldigt itemId" }, 400);
        await markItemHandled(itemId);
        return json({ ok: true, itemId });
      }
      case "refresh": {
        const live = await liveScanDigest();
        if (!live.ok || !live.digest) return json({ ok: false, error: live.error ?? "scan fejlede" }, 502);
        const saved = live.digest.items.length > 0;
        if (saved) await saveDigest(live.digest);
        return json({ ok: true, saved, summary: summarizeDigest(live.digest), note: live.digest.note ?? null });
      }
      default:
        return json({ ok: false, error: "ukendt action" }, 400);
    }
  } catch (err) {
    console.error(JSON.stringify({ evt: "agent.replies.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

// Agent-vejen for Kinlys egne SEO/GEO-signaler (SEO-fanen under Pipeline) —
// samme HMAC-skema som /api/agent/competitors. Validering i seo-signals.ts.
//   POST { action: "geo", results: [{ query, group?, engine, measuredAt, mentionedKinly, competitors }] } → { ok, results }
//   POST { action: "blogcheck", checkedAt, posts: [{ id, title, slug?, stage, keyword, seoIssues, questions: [{ question, answer: ja|delvist|nej|ukendt }] }] } → { ok, posts }
//
// Ingen "next/server"-import: route.test.ts kalder handleren direkte under
// node:test. Undtaget fra proxyens login (api/agent/-præfikset); ruten
// beskytter sig selv.
import { CompetitorInputError, noUnknownKeys, obj } from "../../../../lib/hq/competitors.ts";
import { saveBlogCheck, saveGeo } from "../../../../lib/hq/seo-signals.ts";
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "ugyldig JSON" }, 400);
  }
  try {
    const input = obj(parsed, "body");
    if (input.action === "geo") {
      noUnknownKeys(input, ["action", "results"], "body");
      return json({ ok: true, results: (await saveGeo(input.results)).results.length });
    }
    if (input.action === "blogcheck") {
      noUnknownKeys(input, ["action", "checkedAt", "posts"], "body");
      return json({ ok: true, posts: (await saveBlogCheck(input.checkedAt, input.posts)).posts.length });
    }
    return json({ ok: false, error: "ukendt action — brug geo eller blogcheck" }, 400);
  } catch (err) {
    if (err instanceof CompetitorInputError) return json({ ok: false, error: err.message }, 400);
    console.error(JSON.stringify({ evt: "agent.seo-signals.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

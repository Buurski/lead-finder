// Agent-vejen for "Tests" (Pipeline → Tests) — samme HMAC-skema som
// /api/agent/competitors. Hermes' eksperimenter.py (dagligt, no_agent):
//   { action: "list" }                                   → { ok, experiments (vurderes+tester), geoQueries }
//   { action: "review", id, review: { scores, verdict: test|drop, reason } }
//   { action: "plan", id, plan: { hypothesis, change, metric: { type, target }, days: 7, success } }
//   { action: "measure", metric: { type: gsc_page|gsc_query|geo, target }, start?, end? }  (kun læsning)
//   { action: "baseline", id, baseline: <Measurement> }
//   { action: "result", id, result?: <Measurement>, outcome: { verdict: behold|drop|uklart, summary } }
// Agenten kan ALDRIG beholde/afvise/starte/slette — det findes kun på menneske-ruten /api/tests.
//
// Ingen "next/server"-import: route.test.ts kalder handleren direkte under node:test.
import { CompetitorInputError, enumOf, noUnknownKeys, obj, str } from "../../../../lib/hq/competitors.ts";
import {
  agentQueue, measureGeo, measureKinlyGsc, planExperiment, reviewExperiment, saveBaseline, saveResult,
} from "../../../../lib/hq/experiments.ts";
import { loadGeo } from "../../../../lib/hq/seo-signals.ts";
import { verifyHermesRequest } from "../../../../lib/hermes-hmac.ts";
import { cleanEnv } from "../../../../lib/hermes.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status });
const MAX_BODY = 20_000;

function day(v: unknown, label: string): string {
  const t = str(v, label, 10, true)!;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new CompetitorInputError(`${label} skal være YYYY-MM-DD`);
  return t;
}

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
    switch (input.action) {
      case "list": {
        noUnknownKeys(input, ["action"], "body");
        const geo = await loadGeo();
        return json({ ok: true, experiments: await agentQueue(), geoQueries: (geo?.results ?? []).map((r) => r.query) });
      }
      case "review":
        noUnknownKeys(input, ["action", "id", "review"], "body");
        return json({ ok: true, experiment: await reviewExperiment(input.id, input.review) });
      case "plan":
        noUnknownKeys(input, ["action", "id", "plan"], "body");
        return json({ ok: true, experiment: await planExperiment(input.id, input.plan) });
      case "baseline":
        noUnknownKeys(input, ["action", "id", "baseline"], "body");
        return json({ ok: true, experiment: await saveBaseline(input.id, input.baseline) });
      case "result":
        noUnknownKeys(input, ["action", "id", "result", "outcome"], "body");
        return json({ ok: true, experiment: await saveResult(input.id, input.result, input.outcome) });
      case "measure": {
        noUnknownKeys(input, ["action", "metric", "start", "end"], "body");
        const m = obj(input.metric, "metric");
        noUnknownKeys(m, ["type", "target"], "metric");
        const type = enumOf(m.type, "metric.type", ["gsc_page", "gsc_query", "geo"] as const, true)!;
        const target = str(m.target, "metric.target", 300, true)!;
        if (type === "geo") return json({ ok: true, measurement: measureGeo(await loadGeo(), target) });
        const start = day(input.start, "start");
        const end = day(input.end, "end");
        if (start > end) throw new CompetitorInputError("start skal være før end");
        return json({ ok: true, measurement: await measureKinlyGsc(type, target, start, end) });
      }
      default:
        return json({ ok: false, error: "ukendt action — brug list, review, plan, measure, baseline eller result" }, 400);
    }
  } catch (err) {
    if (err instanceof CompetitorInputError) return json({ ok: false, error: err.message }, 400);
    console.error(JSON.stringify({ evt: "agent.experiments.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

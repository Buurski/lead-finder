// Agent-vejen for den ugentlige konkurrentrapport (Hermes' Jev-scan, søndag
// nat) — samme HMAC-skema som /api/agent/posts/image. Gemmer KUN rapporten
// (competitors.ts' validate+save); siden /konkurrenter læser den read-only.
//   POST { action: "save", report: <CompetitorReport> } → { ok, generatedAt, competitors }
//
// Ingen "next/server"-import: route.test.ts kalder handleren direkte under
// node:test. Undtaget fra proxyens login (api/agent/-præfikset); ruten
// beskytter sig selv.
import { CompetitorInputError, saveReport } from "../../../../lib/hq/competitors.ts";
import { verifyHermesRequest } from "../../../../lib/hermes-hmac.ts";
import { cleanEnv } from "../../../../lib/hermes.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status });

const MAX_BODY = 400_000;

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > MAX_BODY) return json({ ok: false, error: "for stor" }, 413);
  if (!verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  let input: { action?: unknown; report?: unknown };
  try {
    input = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "ugyldig JSON" }, 400);
  }
  if (input.action !== "save") return json({ ok: false, error: "ukendt action — brug save" }, 400);
  try {
    const report = await saveReport(input.report);
    return json({ ok: true, generatedAt: report.generatedAt, competitors: report.competitors.length });
  } catch (err) {
    if (err instanceof CompetitorInputError) return json({ ok: false, error: err.message }, 400);
    console.error(JSON.stringify({ evt: "agent.competitors.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

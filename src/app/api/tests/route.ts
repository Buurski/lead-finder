// Menneske-vejen for "Tests" (Pipeline → Tests). hqWrite = login + Origin-tjek.
//   { action: "create", test: { title, detail?, source: { kind, from, url?, competitor? } } }  ("→ Afprøv hos os")
//   { action: "start" | "keep" | "drop" | "delete", id }
// Hermes' side (vurdering, plan, måling) går via /api/agent/experiments.
import { hqWrite, jsonBody, HqInputError } from "@/lib/hq/api";
import { createExperiment, decideExperiment, deleteExperiment, startExperiment } from "@/lib/hq/experiments";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const body = await jsonBody(req);
    switch (body.action) {
      case "create":
        return { experiment: await createExperiment(body.test, actor) };
      case "start":
        return { experiment: await startExperiment(body.id) };
      case "keep":
        return { experiment: await decideExperiment(body.id, "behold") };
      case "drop":
        return { experiment: await decideExperiment(body.id, "drop") };
      case "delete":
        await deleteExperiment(body.id);
        return { ok: true };
      default:
        throw new HqInputError("ukendt action");
    }
  });
}

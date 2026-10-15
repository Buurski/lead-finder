// Menneske-vejen for Marketing (/marketing). hqWrite = login + Origin-tjek; aktøren er den
// loggede ind (lucas | charlie | delt). Hermes' vej er /api/agent/marketing (kun kladder).
//   { action: "draftCreate", draft }          ny kladde
//   { action: "draftUpdate", id, draft }      ret (indhold, prioritet, dato, spor …)
//   { action: "draftAction", id, op }         op = approve | drop | restore | posted
//   { action: "draftChecks", id, checks }     Charlies ja, kundens ok, "sandt pr. dato"
//   { action: "measureAdd", measure }         manuel måling
//   { action: "measureUpdate", id, measure }  ret en måling (tomme tal = ikke målt)
//   { action: "abCreate", test } · { action: "abStatus", id, status }
//   { action: "inspirationAdd", item }
import { hqWrite, jsonBody, HqInputError } from "@/lib/hq/api";
import { getDb } from "@/lib/db/client";
import {
  addInspiration, addMeasure, createAb, createDraft, draftAction, setAbStatus, setChecks, updateDraft, updateMeasure,
} from "@/lib/hq/marketing";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const body = await jsonBody(req);
    const db = getDb();
    switch (body.action) {
      case "draftCreate":
        return { draft: await createDraft(db, body.draft, actor) };
      case "draftUpdate":
        return { draft: await updateDraft(db, body.id, body.draft, actor) };
      case "draftAction":
        return { draft: await draftAction(db, body.id, body.op, actor) };
      case "draftChecks":
        return { draft: await setChecks(db, body.id, body.checks, actor) };
      case "measureAdd":
        return { measure: await addMeasure(db, body.measure, actor) };
      case "measureUpdate":
        return { measure: await updateMeasure(db, body.id, body.measure) };
      case "abCreate":
        return { test: await createAb(db, body.test, actor) };
      case "abStatus":
        return { test: await setAbStatus(db, body.id, body.status) };
      case "inspirationAdd":
        return { item: await addInspiration(db, body.item, actor) };
      default:
        throw new HqInputError("ukendt action");
    }
  });
}

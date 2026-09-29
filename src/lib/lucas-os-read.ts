// Lucas OS' læse-nøgle (spec §7): LUCAS_OS_READ_SECRET virker KUN på GET /api/agent/read og KUN for
// LUCAS_OS_WHATS. Ingen next/server- eller @/-imports: testes direkte under node:test.
import { EXPENSES_KEY, ExpenseError, lucasOsProjection } from "./expenses.ts";
import { cleanEnv } from "./hermes.ts";
import { verifyHermesRequest } from "./hermes-hmac.ts";
import { store } from "./store.ts";

export const LUCAS_OS_WHATS = new Set(["udgifter"]); // F3 udvider listen

export function authorizedRead(req: Request, what: string): boolean {
  if (verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET))) return true;
  return LUCAS_OS_WHATS.has(what) && verifyHermesRequest(req, cleanEnv(process.env.LUCAS_OS_READ_SECRET));
}

/** Udgifter ligger i KV (ikke Postgres). 413 hvis listen er for lang til én fuld sync. */
export async function udgifterResponse(): Promise<Response> {
  try {
    return Response.json({ ok: true, ...lucasOsProjection(await store.readAll(EXPENSES_KEY)) });
  } catch (err) {
    if (err instanceof ExpenseError) return Response.json({ ok: false, error: err.message }, { status: 413 });
    throw err;
  }
}

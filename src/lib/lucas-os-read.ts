// Lucas OS' læse-nøgle (spec §7): LUCAS_OS_READ_SECRET virker KUN på GET /api/agent/read og KUN for
// LUCAS_OS_WHATS. Ingen next/server- eller @/-imports: testes direkte under node:test.
import { EXPENSES_KEY, ExpenseError, lucasOsProjection } from "./expenses.ts";
import { cleanEnv } from "./hermes.ts";
import { verifyHermesRequest } from "./hermes-hmac.ts";
import { store } from "./store.ts";

// V3-1 (KRAV #34): Vilfred læser HQ — kun disse visninger, og kun felterne i LUCAS_OS_FIELDS (ingen kontaktdata,
// mailtekst, noter, links eller id'er). Kundeopdateringer, svar, søgning, feed, CMS og kontakter er aldrig med.
// F3 (Lucas OS' Arbejde-side, spec §4 "klik åbner i HQ"): opake id'er + HQ-relative stier er med, så rækker kan linke ud og
// afstemmes 1:1 — stadig ingen kontaktdata, noter eller mailtekst. noegletal = HQ's egne aggregater (kun tal).
export const LUCAS_OS_WHATS = new Set(["udgifter", "opmaerksomhed", "min-dag", "pipeline", "blog", "noegletal"]);
const LUCAS_OS_FIELDS: Record<string, { list: string; keep: string[] }> = {
  opmaerksomhed: { list: "items", keep: ["level", "kind", "text", "at", "href"] },
  "min-dag": { list: "items", keep: ["id", "kind", "title", "context", "companyId", "company", "owner", "due", "dueTime", "important", "bucket"] },
  pipeline: { list: "cards", keep: ["companyId", "company", "title", "stage", "owner", "valueDkk", "mrrDkk", "nextStep", "nextStepDue", "updatedAt"] },
  blog: { list: "cards", keep: ["title", "slug", "category", "stage", "excerpt", "publishRequestedAt", "publishedAt"] },
};

export function readerOf(req: Request, what: string): "hermes" | "lucas-os" | null {
  if (verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET))) return "hermes";
  return LUCAS_OS_WHATS.has(what) && verifyHermesRequest(req, cleanEnv(process.env.LUCAS_OS_READ_SECRET)) ? "lucas-os" : null;
}

export function authorizedRead(req: Request, what: string): boolean {
  return readerOf(req, what) !== null;
}

/** HQ-forsidens tal (getHqSummary) → kun aggregater. Samme svar til begge nøgler. */
export function noegletal(s: { money: { mrr: number; outstanding: number; overdueCount: number }; funnel: { stage: string; n: number }[]; kpi: { overdueNextSteps: number } }) {
  return { mrrKr: s.money.mrr, udestaaendeKr: s.money.outstanding, forfaldneFakturaer: s.money.overdueCount,
    kunder: s.funnel.find((f) => f.stage === "kunde")?.n ?? 0, forfaldneSkridt: s.kpi.overdueNextSteps };
}

/** Svar til Lucas OS-nøglen: kun de tilladte felter (fail closed: ukendt visning → tom liste). */
export function projectForLucasOs(what: string, body: Record<string, unknown>): Record<string, unknown> {
  const f = LUCAS_OS_FIELDS[what];
  const rows = f && Array.isArray(body[f.list]) ? (body[f.list] as Record<string, unknown>[]) : [];
  const pick = (r: Record<string, unknown>) => Object.fromEntries((f?.keep ?? []).filter((k) => k in r).map((k) => [k, r[k]]));
  return { ok: body.ok === true, ...(typeof body.today === "string" ? { today: body.today } : {}), [f?.list ?? "items"]: rows.map(pick) };
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

import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { verifyHermesRequest } from "@/lib/hermes-hmac";
import { cleanEnv } from "@/lib/hermes";
import {
  EXPENSES_KEY, PAYMENTS_KEY, ExpenseError, activeExpenses, activePayments, charlieBalance, knownRefs, looksLikeManualDuplicate, parseExpense, type Expense,
} from "@/lib/expenses.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST { expenses: [{ date, vendor, amount (DKK), original?, share?, payer?, ref, note? }] }
// Hermes' månedlige kvitterings-høst. Undtaget fra proxyens login (api/agent/*);
// beskyttet af HMAC med HERMES_API_SECRET: X-Timestamp + Bearer hmac(`${ts}.POST.${path}.${body}`).
// ref (mail message-id) er påkrævet og dedupliker — også mod slettede poster. Et træk der ligner en
// manuel post (±3 dage, <1 kr) springes over og meldes i possibleDuplicates til rapporten.
// Svarer med Charlies saldo efter indlæsning, så cron-rapporten kan citere den.
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 40_000) return NextResponse.json({ ok: false, error: "for stor" }, { status: 413 });
  if (!verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  let items: unknown[];
  try {
    const parsed = JSON.parse(body) as { expenses?: unknown };
    if (!Array.isArray(parsed.expenses) || parsed.expenses.length > 100) throw new Error();
    items = parsed.expenses;
  } catch {
    return NextResponse.json({ ok: false, error: "forventer { expenses: [...] } (maks 100)" }, { status: 400 });
  }
  const raw = await store.readAll(EXPENSES_KEY);
  const existing = activeExpenses(raw);
  const seen = knownRefs(raw); // inkl. slettede: en fjernet kvittering kommer ikke igen
  const added: Expense[] = [];
  const rejected: { index: number; error: string }[] = [];
  const possibleDuplicates: { index: number; vendor: string; date: string; amount: number }[] = [];
  let skipped = 0;
  for (const [index, item] of items.entries()) {
    try {
      const exp = parseExpense(item, "hermes");
      if (!exp.ref) throw new ExpenseError("ref (message-id) påkrævet");
      if (seen.has(exp.ref)) { skipped++; continue; }
      if (looksLikeManualDuplicate(exp, existing)) {
        possibleDuplicates.push({ index, vendor: exp.vendor, date: exp.date, amount: exp.amount });
        continue;
      }
      seen.add(exp.ref);
      await store.append(EXPENSES_KEY, exp);
      added.push(exp);
    } catch (err) {
      rejected.push({ index, error: err instanceof ExpenseError ? err.message : "ugyldig" });
    }
  }
  const balance = charlieBalance([...existing, ...added], activePayments(await store.readAll(PAYMENTS_KEY)));
  return NextResponse.json({ ok: true, added: added.length, skipped, rejected, possibleDuplicates, balance });
}

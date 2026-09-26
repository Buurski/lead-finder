import { NextResponse } from "next/server";
import { store } from "@/lib/store";
import { assertWriteRequest } from "@/lib/cc-auth.ts";
import { EXPENSES_KEY, ExpenseError, activeExpenses, knownRefs, parseExpense } from "@/lib/expenses.ts";

// GET/POST/DELETE — udgiftsloggen fra /udgifter (bag login). Hermes skriver via /api/agent/expenses.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const expenses = activeExpenses(await store.readAll(EXPENSES_KEY));
  return NextResponse.json({ expenses });
}

export async function POST(req: Request) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "afvist" }, { status: 403 });
  }
  let expense;
  try {
    expense = parseExpense(await req.json(), "manual");
  } catch (err) {
    const msg = err instanceof ExpenseError ? err.message : "ugyldig JSON";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
  if (expense.ref && knownRefs(await store.readAll(EXPENSES_KEY)).has(expense.ref)) {
    return NextResponse.json({ error: "posten er allerede registreret" }, { status: 409 });
  }
  await store.append(EXPENSES_KEY, expense);
  return NextResponse.json({ ok: true, expense });
}

export async function DELETE(req: Request) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "afvist" }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mangler" }, { status: 400 });
  await store.append(EXPENSES_KEY, { id, deleted: true });
  return NextResponse.json({ ok: true });
}

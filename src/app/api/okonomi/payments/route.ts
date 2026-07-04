import { NextResponse } from "next/server";
import { store } from "@/lib/store";

export const dynamic = "force-dynamic";

export interface Payment {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number; // DKK
  from: "charlie" | "lucas";
  note?: string;
}

const LOG_KEY = "okonomi_payments";

export async function GET() {
  const all = (await store.readAll(LOG_KEY)) as Payment[];
  const deleted = new Set(all.filter((p) => p.note === "__deleted__").map((p) => p.id));
  const payments = all.filter((p) => p.amount > 0 && !deleted.has(p.id));
  return NextResponse.json({ payments });
}

export async function POST(req: Request) {
  let body: Partial<Payment>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "ugyldig JSON" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000) {
    return NextResponse.json({ error: "beløb skal være 1–100.000 kr" }, { status: 400 });
  }
  const from = body.from === "lucas" ? "lucas" : "charlie";
  const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date)
    ? body.date
    : new Date().toISOString().slice(0, 10);
  const payment: Payment = {
    id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    date,
    amount: Math.round(amount),
    from,
    note: typeof body.note === "string" ? body.note.slice(0, 200) : undefined,
  };
  await store.append(LOG_KEY, payment);
  return NextResponse.json({ ok: true, payment });
}

// Append-only log: sletning = tombstone-entry med samme id.
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id mangler" }, { status: 400 });
  await store.append(LOG_KEY, { id, date: "", amount: 0, from: "charlie", note: "__deleted__" });
  return NextResponse.json({ ok: true });
}

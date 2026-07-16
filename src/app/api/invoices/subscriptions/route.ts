import { NextResponse } from "next/server";
import { getSubscriptions, saveSubscriptions, type Subscription } from "@/lib/invoices.ts";

// GET /api/invoices/subscriptions — liste (UI-redigering fra /fakturaer).
// PUT /api/invoices/subscriptions — erstat hele listen.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const subscriptions = await getSubscriptions();
  return NextResponse.json({ subscriptions });
}

export async function PUT(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { subscriptions?: Subscription[] };
  if (!Array.isArray(body.subscriptions)) {
    return NextResponse.json({ error: "mangler subscriptions-array" }, { status: 400 });
  }
  for (const sub of body.subscriptions) {
    if (!sub.clientName?.trim() || !Array.isArray(sub.lines) || typeof sub.dayOfMonth !== "number") {
      return NextResponse.json({ error: "hvert abonnement skal have clientName, lines og dayOfMonth" }, { status: 400 });
    }
    // dayOfMonth 29-31 ville aldrig være due i korte måneder (nextDueDate clamper ikke).
    if (sub.dayOfMonth < 1 || sub.dayOfMonth > 28) {
      return NextResponse.json({ error: "dayOfMonth skal være 1-28" }, { status: 400 });
    }
  }
  // Manglende `active` må ikke gøre abonnementet stille-dødt — default true.
  const subscriptions = body.subscriptions.map((s) => ({ ...s, active: s.active !== false }));
  await saveSubscriptions(subscriptions);
  return NextResponse.json({ ok: true, subscriptions });
}

// POST /api/replies/remove — "Fjern meddelelsen" fra Svar-siden.
// Skjuler meddelelsen i alle visninger (handled-items-map i KV, samme mekanisme
// som agent-vejen bruger) — der slettes intet i CRM'et, og et NYERE svar fra
// samme afsender dukker op igen, fordi markeringen tidsstemples.
import { NextResponse } from "next/server";
import { assertWriteRequest } from "@/lib/cc-auth";
import { currentUser } from "@/lib/current-user";
import { markItemHandled } from "@/lib/inbox-digest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 403 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "ikke logget ind" }, { status: 401 });

  const b = (await req.json().catch(() => null)) as { itemId?: unknown } | null;
  const itemId = typeof b?.itemId === "string" ? b.itemId.trim() : "";
  if (!itemId || itemId.length > 128) {
    return NextResponse.json({ ok: false, error: "ugyldigt itemId" }, { status: 400 });
  }
  try {
    await markItemHandled(itemId);
    return NextResponse.json({ ok: true, itemId });
  } catch (err) {
    console.error(JSON.stringify({ evt: "replies.remove.failed", error: String(err).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "kunne ikke fjerne" }, { status: 500 });
  }
}

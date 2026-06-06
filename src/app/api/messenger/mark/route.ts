import { NextResponse } from "next/server";
import { markMessenger, unmarkMessenger } from "@/lib/messenger/state";

// POST /api/messenger/mark — record that Lucas DM'd a candidate ("sent"), passed
// on it ("skip"), or undid that ("unmark"). State only; no message is ever sent
// from here (Messenger DMs are pasted by Lucas on facebook.com).
export const dynamic = "force-dynamic";

interface Body {
  id?: string;
  action?: "sent" | "skip" | "unmark";
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const action = body.action ?? "sent";

  const state = action === "unmark" ? await unmarkMessenger(id) : await markMessenger(id, action);
  return NextResponse.json({
    ok: true,
    id,
    action,
    counts: { sent: Object.keys(state.sent).length, skipped: Object.keys(state.skipped).length },
  });
}

import { NextResponse } from "next/server";
import { removeClient } from "@/lib/sheets";

// POST /api/clients/remove { name } — delete a client row from the Clients tab.
// By name (not row id) so it can't delete the wrong row after a shift. Read-write Sheets.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { name } = await req.json().catch(() => ({}));
  if (!name || typeof name !== "string") return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    const r = await removeClient(name);
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

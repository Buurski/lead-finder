import { NextResponse } from "next/server";
import { readVaultNote } from "@/lib/vault";

// GET /api/vault/note?path=wiki/os/roadmap-naeste-skridt — read one note
// (local-first, remote fallback). Read-only.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ ok: false, reason: "path required" }, { status: 400 });
  const note = await readVaultNote(path);
  return NextResponse.json(note);
}

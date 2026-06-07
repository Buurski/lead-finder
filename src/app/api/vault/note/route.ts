import { NextResponse } from "next/server";
import { readVaultNote } from "@/lib/vault";

// GET /api/vault/note?path=wiki/os/roadmap-naeste-skridt — read one note.
// daily/ notes read remote-first (the live Obsidian vault, pushed each morning);
// everything else stays local-first with remote fallback. Read-only.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = url.searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ ok: false, reason: "path required" }, { status: 400 });
  // daily/ notes are always remote (live brief); other surfaces (e.g. /memory) opt in
  // with ?remote=1 so they read the live vault instead of the committed snapshot.
  const preferRemote = path.startsWith("daily/") || url.searchParams.get("remote") === "1";
  const note = await readVaultNote(path, { preferRemote });
  return NextResponse.json(note);
}

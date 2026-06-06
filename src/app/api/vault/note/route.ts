import { NextResponse } from "next/server";
import { readVaultNote } from "@/lib/vault";

// GET /api/vault/note?path=wiki/os/roadmap-naeste-skridt — read one note.
// daily/ notes read remote-first (the live Obsidian vault, pushed each morning);
// everything else stays local-first with remote fallback. Read-only.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const path = new URL(req.url).searchParams.get("path") ?? "";
  if (!path) return NextResponse.json({ ok: false, reason: "path required" }, { status: 400 });
  const preferRemote = path.startsWith("daily/");
  const note = await readVaultNote(path, { preferRemote });
  return NextResponse.json(note);
}

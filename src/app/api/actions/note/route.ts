import { NextResponse } from "next/server";
import { queueNote } from "@/lib/notes-queue";
import type { NoteBucket } from "@/lib/notes-queue";

// POST /api/actions/note — confirmed "save a note" action from the chat.
//   { text, bucket?: said-no|maybe-later|interested|general|task-intent }
// Queued in KV; a Cowork mirror-task writes it into the right Obsidian file.
export const dynamic = "force-dynamic";

const BUCKETS = new Set(["said-no", "maybe-later", "interested", "general", "task-intent"]);

export async function POST(req: Request) {
  let body: { text?: string; bucket?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const text = String(body.text ?? "").trim().slice(0, 1000);
  if (!text) return NextResponse.json({ error: "text required" }, { status: 400 });
  const bucket = (BUCKETS.has(body.bucket ?? "") ? body.bucket : "general") as NoteBucket;

  await queueNote({ bucket, text });
  return NextResponse.json({ ok: true, message: "Note gemt — spejles til Obsidian." });
}

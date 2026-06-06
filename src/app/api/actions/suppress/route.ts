import { NextResponse } from "next/server";
import { addSuppressed, removeSuppressed } from "@/lib/today-overrides";
import { queueNote } from "@/lib/notes-queue";

// POST /api/actions/suppress — confirmed "remove X from today" action from the chat.
//   { name, undo?, note? }  hide (or un-hide) a business from Mission Control's
//   "Hvad skal vi i dag" lists. Queues an Obsidian note. Does NOT change layout.
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { name?: string; undo?: boolean; note?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  if (body.undo) {
    await removeSuppressed(name);
    return NextResponse.json({ ok: true, message: `${name} vises igen i dag.` });
  }
  await addSuppressed(name);
  await queueNote({ bucket: "general", text: body.note || `Skjult fra "i dag": ${name}.`, leadName: name });
  return NextResponse.json({ ok: true, message: `${name} er fjernet fra "i dag".` });
}

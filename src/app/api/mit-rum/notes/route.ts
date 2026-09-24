import { NextResponse } from "next/server";
import { assertWriteRequest } from "@/lib/cc-auth";
import { currentUser } from "@/lib/current-user";
import { addNote, deleteNote, listNotes } from "@/lib/mit-rum";

// /api/mit-rum/notes — private noter. Al identitet udledes af currentUser()
// (server-verificeret); kun personligt login ("lucas"/"charlie") har adgang.
// Det gamle fælles-login ("delt") og udloggede får 403/401 — intet privat rum.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PersonalUser = "lucas" | "charlie";

function personal(user: string | null): user is PersonalUser {
  return user === "lucas" || user === "charlie";
}

function denied() {
  return NextResponse.json({ ok: false, error: "kræver personligt login" }, { status: 403 });
}

export async function GET() {
  const user = await currentUser();
  if (!personal(user)) return denied();
  return NextResponse.json({ ok: true, notes: await listNotes(user) });
}

export async function POST(req: Request) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 403 });
  }
  const user = await currentUser();
  if (!personal(user)) return denied();

  const b = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof b?.text === "string" ? b.text : "";
  try {
    const note = await addNote(user, text);
    return NextResponse.json({ ok: true, note });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 403 });
  }
  const user = await currentUser();
  if (!personal(user)) return denied();

  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "id mangler" }, { status: 400 });
  // deleteNote rører kun DEN brugerens liste — en fremmed id er en no-op.
  await deleteNote(user, id);
  return NextResponse.json({ ok: true });
}

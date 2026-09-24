import { NextResponse } from "next/server";
import { currentUser } from "@/lib/current-user";
import { canAccessSession, getHermesMessages, listAllSessions, listSessionsFor } from "@/lib/hermes";

// GET /api/hermes/sessions              — samtaler den indloggede bruger må se
// GET /api/hermes/sessions?id=<session> — fuld transskription (kun egne/delte)
// Brugeren udledes ALTID af currentUser() (server-verificeret) — intet ?profile.
export const dynamic = "force-dynamic";

const SESSION_RE = /^[A-Za-z0-9_-]{1,64}$/;

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "ikke logget ind" }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    if (!SESSION_RE.test(id)) return NextResponse.json({ ok: false, error: "ugyldigt id" }, { status: 400 });
    const meta = (await listAllSessions()).find((s) => s.id === id);
    // Ukendt id OG fremmed samtale svarer ens — vi afslører ikke at den findes.
    if (!meta || !canAccessSession(meta, user)) {
      return NextResponse.json({ ok: false, error: "ikke fundet" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, messages: await getHermesMessages(id) });
  }
  return NextResponse.json({ ok: true, sessions: await listSessionsFor(user) });
}

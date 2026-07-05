import { NextResponse } from "next/server";
import { getHermesMessages, listHermesSessions, HERMES_PROFILES, type HermesProfile } from "@/lib/hermes";

// GET /api/hermes/sessions?profile=lucas       — session list for a profile
// GET /api/hermes/sessions?id=<sessionId>      — full transcript of one session
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ ok: false, error: "ugyldigt id" }, { status: 400 });
    const messages = await getHermesMessages(id);
    return NextResponse.json({ ok: true, messages });
  }
  const profileParam = url.searchParams.get("profile") ?? undefined;
  const profile = profileParam && HERMES_PROFILES.includes(profileParam as HermesProfile)
    ? (profileParam as HermesProfile)
    : undefined;
  const sessions = await listHermesSessions(profile);
  return NextResponse.json({ ok: true, sessions });
}

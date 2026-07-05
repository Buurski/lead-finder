import { NextResponse } from "next/server";
import { hermesCronAction, hermesCronList } from "@/lib/hermes";

// GET  /api/hermes/cron          — list Hermes' scheduled jobs (dreaming m.fl.)
// POST /api/hermes/cron          — { id, action: run|pause|resume }
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const jobs = await hermesCronList();
  return NextResponse.json({ ok: true, jobs });
}

export async function POST(req: Request) {
  let body: { id?: string; action?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "ugyldig JSON" }, { status: 400 });
  }
  const id = (body.id ?? "").trim();
  const action = (body.action ?? "").trim() as "run" | "pause" | "resume";
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) return NextResponse.json({ ok: false, error: "ugyldigt job-id" }, { status: 400 });
  if (!["run", "pause", "resume"].includes(action)) {
    return NextResponse.json({ ok: false, error: "action skal være run|pause|resume" }, { status: 400 });
  }
  const result = await hermesCronAction(id, action);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  return NextResponse.json({ ok: true });
}

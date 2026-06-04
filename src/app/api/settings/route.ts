import { NextResponse } from "next/server";
import { readSettings, writeSettings, nextRunLabel } from "@/lib/settings";

// GET/POST app settings (engine cadence). POST accepts a partial patch.
export const dynamic = "force-dynamic";

export async function GET() {
  const s = await readSettings();
  return NextResponse.json({ settings: s, nextRun: nextRunLabel(s) });
}

export async function POST(req: Request) {
  let patch: Record<string, unknown>;
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const s = await writeSettings(patch);
  return NextResponse.json({ settings: s, nextRun: nextRunLabel(s) });
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { listUpdates, type UpdateStatus } from "@/lib/hq/customer-updates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET ?status=kladde|sendt|kasseret
export async function GET(req: Request) {
  const s = new URL(req.url).searchParams.get("status") ?? "kladde";
  if (!["kladde", "sendt", "kasseret"].includes(s)) return NextResponse.json({ error: "ugyldig status" }, { status: 400 });
  return NextResponse.json({ updates: await listUpdates(getDb(), s as UpdateStatus) });
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { searchAll } from "@/lib/hq/search";
import { isCommandCenterRequest } from "@/lib/cc-auth";

export const runtime = "nodejs";

// GET ?q=<tekst> — global søgning til ⌘K-paletten (virksomheder, kontakter,
// aftaler, fakturaer). Læse-rute: samme auth-mønster som /api/virksomheder/search.
async function authorized(req: Request): Promise<boolean> {
  const authConfigured = Boolean(process.env.VERCEL_BASIC_AUTH_USER && process.env.VERCEL_BASIC_AUTH_PASS && process.env.AUTH_SESSION_SECRET);
  if (!authConfigured) return true;
  return isCommandCenterRequest(req);
}

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const groups = await searchAll(getDb(), q);
  return NextResponse.json(groups);
}

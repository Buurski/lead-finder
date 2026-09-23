import { NextResponse } from "next/server";
import { and, eq, ilike, ne } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { company } from "@/lib/db/schema";
import { isCommandCenterRequest } from "@/lib/cc-auth";

export const runtime = "nodejs";

// GET ?q=<navn>&exclude=<id> — bruges af "Flet med…"-panelet på profilen til at
// finde den anden virksomhed. Læse-rute: kræver kun proxy-markøren når auth er
// konfigureret (samme mønster som andre GET-ruter, fx /api/previews).
async function authorized(req: Request): Promise<boolean> {
  const authConfigured = Boolean(process.env.VERCEL_BASIC_AUTH_USER && process.env.VERCEL_BASIC_AUTH_PASS && process.env.AUTH_SESSION_SECRET);
  if (!authConfigured) return true;
  return isCommandCenterRequest(req);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const exclude = url.searchParams.get("exclude") ?? "";
  if (!q) return NextResponse.json([]);
  const pattern = `%${q.replace(/[%_\\]/g, "\\$&")}%`;
  const rows = await getDb()
    .select({ id: company.id, name: company.name, city: company.city, lifecycle: company.lifecycle, clientNo: company.clientNo })
    .from(company)
    .where(and(eq(company.archived, false), ilike(company.name, pattern), UUID.test(exclude) ? ne(company.id, exclude) : undefined))
    .limit(8);
  return NextResponse.json(rows);
}

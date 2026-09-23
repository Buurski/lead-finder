// GET /api/pipeline/companies?q=... — virksomheds-søgning til "Ny aftale"-dialogen.
// Læse-rute (ingen skrivning), men beskyttet ligesom andre GET-ruter når auth er
// konfigureret (samme mønster som /api/previews).
import { NextRequest, NextResponse } from "next/server";
import { and, eq, ilike } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { company } from "@/lib/db/schema";
import { isCommandCenterRequest } from "@/lib/cc-auth";

export const runtime = "nodejs";

async function authorized(req: NextRequest): Promise<boolean> {
  const authConfigured = Boolean(process.env.VERCEL_BASIC_AUTH_USER && process.env.VERCEL_BASIC_AUTH_PASS && process.env.AUTH_SESSION_SECRET);
  if (!authConfigured) return true; // matcher assertWriteRequest: kun håndhævet når auth er sat op
  return isCommandCenterRequest(req);
}

// ILIKE-metategn er ikke escapet af Postgres — % og _ skal escapes, ellers kan
// søgeteksten selv opføre sig som wildcards.
function escapeLike(v: string): string {
  return v.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") || "").trim().slice(0, 100);
  if (!q) return NextResponse.json({ companies: [] });

  const rows = await getDb()
    .select({ id: company.id, name: company.name, city: company.city })
    .from(company)
    .where(and(eq(company.archived, false), ilike(company.name, `%${escapeLike(q)}%`)))
    .limit(8);

  return NextResponse.json({ companies: rows });
}

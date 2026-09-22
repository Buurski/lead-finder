import { NextResponse } from "next/server";
import { assertWriteRequest } from "@/lib/cc-auth";
import { getDb } from "@/lib/db/client";
import { applyMigration, loadSource, planMigration } from "@/lib/pg/migrate";

export const runtime = "nodejs";
export const maxDuration = 300;

// POST mode=dry → rapport uden at skrive. mode=apply → idempotent flytning til Postgres.
// Kun fra en godkendt Command Center-session, same-origin (samme vagt som fakturaer).
export async function POST(req: Request) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ error: String((err as Error).message) }, { status: 403 });
  }
  const mode = new URL(req.url).searchParams.get("mode");
  if (mode !== "dry" && mode !== "apply") return NextResponse.json({ error: "mode=dry|apply" }, { status: 400 });

  try {
    const src = await loadSource();
    const report = mode === "dry" ? planMigration(src) : await applyMigration(getDb(), src);
    return NextResponse.json({ mode, report });
  } catch (err) {
    console.error(JSON.stringify({ evt: "migrate-pg.failed", mode, error: String(err).slice(0, 500) }));
    return NextResponse.json({ error: String((err as Error).message).slice(0, 500) }, { status: 500 });
  }
}

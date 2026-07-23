// Diagnostic route — fjernes igen efter at env-debug er løst.
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    HERMES_WEBUI_URL: process.env.HERMES_WEBUI_URL ?? null,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV,
  });
}

// POST /api/ops/run-cron/[name] — browser-facing "Kør nu" trigger.
// Lives OUTSIDE /api/cron/ so the basic-auth proxy covers it (proxy.ts exempts
// api/cron/*). Forwards internally to the real cron runner with the CRON_SECRET
// bearer, so the browser never needs to know the secret and the cron routes can
// keep requiring it.
import { NextResponse } from "next/server";
import { POST as runCron } from "@/app/api/cron/run/[name]/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  // Only forward the secret when the basic-auth proxy is actually armed.
  // Preview deploys have no basic-auth env vars, so the proxy passes everything
  // through — forwarding CRON_SECRET there would hand any visitor a cron trigger.
  // Local dev (no VERCEL_ENV) stays open, same as the cron routes themselves.
  const proxyArmed =
    process.env.VERCEL_BASIC_AUTH_USER && process.env.VERCEL_BASIC_AUTH_PASS && process.env.AUTH_SESSION_SECRET;
  if (process.env.VERCEL_ENV && !proxyArmed) {
    return NextResponse.json({ ok: false, error: "run-cron kræver armeret basic auth (ikke preview)" }, { status: 403 });
  }
  const forwarded = new Request(req.url, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  return runCron(forwarded, ctx);
}

// POST /api/ops/run-cron/[name] — browser-facing "Kør nu" trigger.
// Lives OUTSIDE /api/cron/ so the basic-auth proxy covers it (proxy.ts exempts
// api/cron/*). Forwards internally to the real cron runner with the CRON_SECRET
// bearer, so the browser never needs to know the secret and the cron routes can
// keep requiring it.
import { POST as runCron } from "@/app/api/cron/run/[name]/route";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const forwarded = new Request(req.url, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
  });
  return runCron(forwarded, ctx);
}

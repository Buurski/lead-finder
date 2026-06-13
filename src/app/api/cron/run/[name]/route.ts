// POST /api/cron/run/[name] — manual "Kør nu" trigger from the Mission Control
// widget. Delegates to the real cron route handler by re-importing it, so the
// behaviour is identical to the scheduled fire. No auth beyond CRON_SECRET
// (optional) — same gate as the scheduled caller.
import { NextResponse } from "next/server";
import { withCronLog } from "@/lib/cron-log";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KNOWN: Record<string, () => Promise<unknown>> = {
  "pre-cleanup": async () => {
    const mod = await import("../pre-cleanup/route");
    const r = await mod.GET();
    const j = await r.json().catch(() => ({}));
    return { checked: j.checked ?? 0, recovered: j.recovered ?? 0 };
  },
  "sync-replies": async () => {
    const { syncReplies } = await import("@/lib/sync-replies");
    const r = await syncReplies();
    return { synced: r.synced, checked: r.checked };
  },
  "engine": async () => {
    const mod = await import("../engine/route");
    // Build a Request so the route's own secret/force logic still runs.
    const fakeReq = new Request("http://x/api/cron/engine?force=1", { headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` } });
    const r = await mod.GET(fakeReq);
    return await r.json().catch(() => ({}));
  },
};

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  const { name } = await ctx.params;
  const fn = KNOWN[name];
  if (!fn) {
    return NextResponse.json({ ok: false, error: `ukendt cron: ${name}` }, { status: 404 });
  }
  try {
    const summary = await withCronLog(name, async () => {
      const result = await fn();
      return { result, note: `manuelt kørt fra widget` };
    });
    return NextResponse.json({ ok: true, cron: name, ran: true, summary });
  } catch (err) {
    return NextResponse.json({ ok: false, cron: name, ran: false, error: String(err) }, { status: 500 });
  }
}

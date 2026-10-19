import { NextResponse } from "next/server";
import { withCronLog } from "@/lib/cron-log";
import { fetchNeonProject, quotaStatus } from "@/lib/neon-quota";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

// Hver 4. time: Neon-forbrug → cron-loggen. ok:false fra 70 % (eller hvis nøglen
// mangler), så /api/cron/health og Hermes ser det uden at vække databasen.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await withCronLog("neon-quota", async () => {
      const s = quotaStatus(await fetchNeonProject());
      if (!s.ok) throw new Error(`ADVARSEL: ${s.note}`);
      return { result: s, note: s.note };
    });
    return NextResponse.json({ ...result, ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}

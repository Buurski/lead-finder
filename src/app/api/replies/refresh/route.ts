// POST /api/replies/refresh — "Scan nu" på Svar-siden.
// Trigger VPS-cron-jobbet inbox-digest-sync, som henter mails fra lucas@kinly.dk
// og skriver en frisk digest til KV. Selve kørslen er asynkron (minutter), så
// svaret her betyder "startet" — siden genindlæses bagefter.
// Bevidst IKKE den gamle /api/cron/inbox-triage-vej: dens live-scan læser andre
// konti (buur.aigro/charlie) og ville overskrive Kinly-indbakken med forkerte data.
import { NextResponse } from "next/server";
import { assertWriteRequest } from "@/lib/cc-auth";
import { currentUser } from "@/lib/current-user";
import { hermesCronAction, hermesCronList, hermesConfigured } from "@/lib/hermes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOB_NAME = "inbox-digest-sync";

export async function POST(req: Request) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 403 });
  }
  const user = await currentUser();
  if (!user) return NextResponse.json({ ok: false, error: "ikke logget ind" }, { status: 401 });
  if (!hermesConfigured()) {
    return NextResponse.json({ ok: false, error: "VPS-forbindelsen er ikke konfigureret" }, { status: 502 });
  }

  const jobs = await hermesCronList();
  const job = jobs.find((j) => j.name === JOB_NAME);
  if (!job?.id) {
    return NextResponse.json({ ok: false, error: `scan-jobbet "${JOB_NAME}" findes ikke på VPS'en` }, { status: 502 });
  }
  const run = await hermesCronAction(job.id, "run");
  if (!run.ok) {
    return NextResponse.json({ ok: false, error: run.error ?? "kunne ikke starte scan" }, { status: 502 });
  }
  return NextResponse.json({ ok: true, started: true, jobId: job.id, note: "Scannet kører på VPS'en — tager typisk et par minutter." });
}

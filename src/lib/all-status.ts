// all-status.ts — Bundle K DEL 1. Aggregates task-status across the three
// platforms that run Lucas's automations, for the central ops picture Mission
// Control and the watchdogs both read. Best-effort per source: one platform
// failing never breaks the others. Strip-safe (no Next.js imports).

import fs from "node:fs/promises";
import path from "node:path";
import vercelConfig from "../../vercel.json" with { type: "json" };

export interface VercelCronStatus {
  path: string;
  schedule: string;
}

export interface ScheduledTaskStatus {
  taskId: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  enabled: boolean;
  source: "cowork" | "unknown";
}

export interface HermesCronStatus {
  note: string;
}

export interface AllStatus {
  vercel: VercelCronStatus[];
  scheduled: ScheduledTaskStatus[];
  hermes: HermesCronStatus[];
  generatedAt: string;
}

// Vercel exposes no public run-history API without a project token (none
// configured here, jf. CLAUDE.md "ALDRIG Vercel CLI") — so this is the
// declared schedule from vercel.json, not live run status. True per-run
// state lives only in Vercel's own dashboard/logs.
function getVercelCrons(): VercelCronStatus[] {
  const crons = (vercelConfig as { crons?: { path: string; schedule: string }[] }).crons ?? [];
  return crons.map((c) => ({ path: c.path, schedule: c.schedule }));
}

// Cowork Scheduled Tasks store one folder per task under
// Documents\Claude\Scheduled\<taskId>\SKILL.md. There is no run-log file —
// this reads directory mtime as a same-machine-only "last touched" proxy.
// Real run history is inside each task's own Cowork session, not on disk.
async function getScheduledTasks(): Promise<ScheduledTaskStatus[]> {
  const dir = "C:\\Users\\Buur\\Documents\\Claude\\Scheduled";
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const tasks: ScheduledTaskStatus[] = [];
    for (const e of entries) {
      if (!e.isDirectory() || e.name.includes("test")) continue;
      const skillPath = path.join(dir, e.name, "SKILL.md");
      let lastRunAt: string | null = null;
      try {
        const stat = await fs.stat(skillPath);
        lastRunAt = stat.mtime.toISOString();
      } catch {
        /* SKILL.md missing — leave null */
      }
      tasks.push({ taskId: e.name, lastRunAt, nextRunAt: null, enabled: true, source: "cowork" });
    }
    return tasks;
  } catch {
    return [];
  }
}

// Hermes exposes /api/hermes/status (website health of the shim), not a
// cron-run listing — there is no endpoint for individual Hermes cronjob
// history today (jf. hermes-cron-oversigt.md). Stub until Hermes gets one.
function getHermesCrons(): HermesCronStatus[] {
  return [{ note: "ukendt — Hermes eksponerer intet cron-run-listing-endpoint endnu, kun /api/hermes/status (shim-health)" }];
}

export async function getAllStatus(): Promise<AllStatus> {
  const [scheduled] = await Promise.all([getScheduledTasks()]);
  return {
    vercel: getVercelCrons(),
    scheduled,
    hermes: getHermesCrons(),
    generatedAt: new Date().toISOString(),
  };
}

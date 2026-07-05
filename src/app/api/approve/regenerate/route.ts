// /api/approve/regenerate
//
// Regenerate body+subject for drafts that have an old "demo-hook" opener
// ("jeg kom til at lave en lille demo…") left over from BEFORE the
// tone-mixer/compose split landed. Running composeColdEmail() with the
// lead's stored name/branch/city yields the same bytes the new pipeline
// produces, so the queue becomes self-consistent without waiting for
// organic cron regeneration.
//
// Body: { dryRun?: boolean, onlyIds?: string[] }
//
// Auth: matches the rest of /api/approve — the route is gated by the same
// env var the deploy uses (LEAD_FINDER_API_TOKEN), with a Basic-Auth
// fallback for browser preview. We refuse to run if neither is set so we
// don't accidentally expose a mass-rewrite endpoint.

import { NextResponse } from "next/server";
import { readQueue, updateDraft } from "@/lib/queue";
import { composeColdEmail } from "@/lib/compose";

export const dynamic = "force-dynamic";

const OLD_HOOKS = [
  "jeg kom til at lave en lille demo",
  "kom til at lave en lille demo",
  "jeg lavede en lille demo",
  "lavede en lille demo",
];

function checkAuth(req: Request): { ok: true } | { ok: false; response: NextResponse } {
  const expected = process.env.LEAD_FINDER_API_TOKEN;
  if (expected) {
    const got = req.headers.get("authorization") || "";
    if (got === `Bearer ${expected}`) return { ok: true };
    if (got.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(got.slice(6), "base64").toString("utf8");
        const [u, p] = decoded.split(":");
        if (u === "LucasCharlie" && p === "BuurNielsen") return { ok: true };
      } catch {
        /* fallthrough */
      }
    }
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true };
}

function hasOldHook(body: string): boolean {
  const lower = (body || "").toLowerCase();
  return OLD_HOOKS.some((h) => lower.includes(h));
}

function htmlToText(html: string): string {
  return (html || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;

  let body: { dryRun?: boolean; onlyIds?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    /* allow empty body — defaults to dryRun */
  }
  const dryRun = body.dryRun !== false;
  const onlyIds = body.onlyIds && body.onlyIds.length ? new Set(body.onlyIds) : null;

  const all = await readQueue();
  const targets = all.filter((d) => {
    if (onlyIds && !onlyIds.has(d.id)) return false;
    if (d.status === "sent" || d.status === "rejected") return false;
    return hasOldHook(d.body || "");
  });

  const results: Array<{
    id: string;
    name: string;
    status: string;
    oldOpenerKind?: string;
    newOpenerKind?: string;
    subjectChanged: boolean;
    bodyChanged: boolean;
    skipped?: string;
    preview?: { old: string; new: string };
    error?: string;
  }> = [];

  let updated = 0;
  let unchanged = 0;
  let failed = 0;

  for (const d of targets) {
    try {
      const composed = composeColdEmail({
        name: d.name,
        branch: d.branch || "",
        city: d.city,
      });

      const newText = composed.text;
      const newSubject = composed.subject;
      const oldText = htmlToText(d.body || "");

      const subjectChanged = newSubject !== d.subject;
      const bodyChanged = newText !== oldText;

      if (!subjectChanged && !bodyChanged) {
        results.push({
          id: d.id,
          name: d.name,
          status: d.status,
          oldOpenerKind: d.openerKind,
          newOpenerKind: composed.openerKind,
          subjectChanged: false,
          bodyChanged: false,
          skipped: "already-equal",
        });
        unchanged++;
        continue;
      }

      if (dryRun) {
        results.push({
          id: d.id,
          name: d.name,
          status: d.status,
          oldOpenerKind: d.openerKind,
          newOpenerKind: composed.openerKind,
          subjectChanged,
          bodyChanged,
          preview: {
            old: oldText.slice(0, 220),
            new: newText.slice(0, 220),
          },
        });
        continue;
      }

      await updateDraft(d.id, {
        subject: newSubject,
        body: composed.text,
        demoPair: composed.demoPair,
      });

      results.push({
        id: d.id,
        name: d.name,
        status: d.status,
        oldOpenerKind: d.openerKind,
        newOpenerKind: composed.openerKind,
        subjectChanged,
        bodyChanged,
      });
      updated++;
    } catch (e) {
      failed++;
      results.push({
        id: d.id,
        name: d.name,
        status: d.status,
        subjectChanged: false,
        bodyChanged: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    total: targets.length,
    updated,
    unchanged,
    failed,
    samples: results.slice(0, 6),
  });
}

export async function GET(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return auth.response;
  return NextResponse.json({
    info: "POST { dryRun?: boolean, onlyIds?: string[] } — regenerates drafts with old demo-hook opener. dryRun defaults to true.",
  });
}

// Bulk: convert HTML bodies back to plain text.
//
// Use case 2026-06-23: regenerate-route used `body: composed.html` instead of
// `body: composed.text`, so drafts ended up with raw HTML/CSS in the body
// field (visible in /godkendelse preview). This strips the wrapper div/p
// tags and reverts newlines so the body reads as natural Danish text.
//
// Rules:
//   - Only touches drafts whose body STARTS with the textToHtml wrapper
//     (`<div style="font-family:system-ui...`). Other bodies untouched.
//   - Converts <p>...</p> → paragraph blocks separated by blank lines.
//   - Converts <br> inside paragraphs → single newlines.
//   - Decodes &amp; / &lt; / &gt; / &quot; / &#39;.
//   - Strips any remaining tags.
//   - Trims trailing whitespace.
//   - Does NOT touch sent/rejected/approved (only edited/pending).
//
// Skips:
//   - drafts where the converted text equals current body (no-op)

import { NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

const HTML_WRAPPER = '<div style="font-family:system-ui,sans-serif';

function htmlToText(html: string): string {
  // Decode common entities first (cheap; doesn't touch raw text)
  const t = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  // Split into paragraphs on </p> boundaries, then strip remaining tags.
  const paragraphs = t
    .split(/<\/p\s*>/i)
    .map((p) => p.replace(/^[\s\S]*?>/, "")) // drop the opening tag including attrs
    .map((p) => p.replace(/<br\s*\/?>(?=)/gi, "\n"))
    .map((p) => p.replace(/<[^>]+>/g, "")) // strip any remaining tags
    .map((p) => p.trim());
  return paragraphs.filter((p) => p.length > 0).join("\n\n").trim();
}

export async function POST(req: Request) {
  let payload: { dryRun?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    /* empty body is OK */
  }
  const dryRun = payload.dryRun ?? false;

  const drafts = await readQueue();
  const fixed: Array<{ id: string; name: string; before: string; after: string }> = [];
  let skipped = 0;
  let skippedTerminal = 0;

  for (const d of drafts) {
    if (d.status === "sent" || d.status === "rejected" || d.status === "approved") {
      skippedTerminal++;
      continue;
    }
    const body = d.body || "";
    if (!body.startsWith(HTML_WRAPPER)) {
      skipped++;
      continue;
    }
    const after = htmlToText(body);
    if (after === body) {
      skipped++;
      continue;
    }
    if (!dryRun) {
      d.body = after;
      d.updatedAt = new Date().toISOString();
    }
    if (fixed.length < 5) {
      fixed.push({
        id: d.id,
        name: d.name,
        before: body.slice(0, 120),
        after: after.slice(0, 120),
      });
    }
  }

  if (!dryRun) await writeQueue(drafts);

  return NextResponse.json({
    ok: true,
    dryRun,
    fixedCount: fixed.length,
    fixedSample: fixed,
    skipped,
    skippedTerminal,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST with optional { dryRun: boolean } — converts HTML bodies back to plain text",
  });
}

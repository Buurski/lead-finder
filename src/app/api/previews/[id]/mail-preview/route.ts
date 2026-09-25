import { NextResponse } from "next/server";
import { authorizedRead, jsonBody } from "@/lib/hq/api";
import { readPreviewRequests } from "@/lib/preview-queue";
import { composePreviewMail, type SenderId } from "@/lib/senders";
import { previewBodyError } from "@/lib/hq/preview-send";

export const runtime = "nodejs";

// POST { sender, body } → { html } — samme komposition som send-ruten, så det I ser er det der sendes.
// Ren rendering: sender intet og skriver intet.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await authorizedRead(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  if (!/^preview_[a-z0-9_]{4,40}$/.test(id)) return NextResponse.json({ error: "ugyldigt id" }, { status: 400 });
  const b = await jsonBody(req);
  const sender: SenderId = b.sender === "charlie" ? "charlie" : "lucas";
  const rec = (await readPreviewRequests()).find((r) => r.id === id);
  if (!rec) return NextResponse.json({ error: "findes ikke" }, { status: 404 });
  const body = String(b.body ?? "");
  const invalid = previewBodyError(body, rec.previewUrl);
  if (invalid) return NextResponse.json({ error: invalid }, { status: 422 });
  const { html } = composePreviewMail(body.trim(), sender, rec.seoTjek);
  return NextResponse.json({ html, report: Boolean(rec.seoTjek) });
}

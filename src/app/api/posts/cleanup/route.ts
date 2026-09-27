import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { listPosts } from "@/lib/hq/posts";
import { keepIdea, openIdeaCleanup } from "@/lib/hq/idea-cleanup";
import { authorizedRead, hqWrite, jsonBody, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

// GET — Hermes' åbne oprydnings-forslag til Idéer-kolonnen (kun kort der stadig er idéer, ikke beholdt).
export async function GET(req: Request) {
  if (!(await authorizedRead(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const ideas = new Set((await listPosts(getDb(), { stage: "ide" })).map((c) => c.id));
  return NextResponse.json(await openIdeaCleanup(ideas));
}

// POST { keep: <uuid> } — "Behold": forslaget forsvinder og kommer ikke igen. Slet går via DELETE /api/posts/[id].
export async function POST(req: Request) {
  return hqWrite(req, async () => {
    const b = await jsonBody(req);
    await keepIdea(uuid(b.keep, "idé-id"));
    return { ok: true };
  });
}

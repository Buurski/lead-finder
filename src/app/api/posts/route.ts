import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { BlogInputError, createPost, listPosts } from "@/lib/hq/posts";
import { authorizedRead, hqWrite, jsonBody } from "@/lib/hq/api";

export const runtime = "nodejs";

// GET ?stage=ide|arbejder|klar|publicer|udgivet — kort-listen til /blog-tavlen.
// Uden body (listPosts' kontrakt); tjekliste, scorekort, ratings og Jev-status
// følger med, så tavlen kan vise hvad der mangler uden et ekstra kald.
export async function GET(req: Request) {
  if (!(await authorizedRead(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const stage = (new URL(req.url).searchParams.get("stage") || "").trim();
  try {
    return NextResponse.json({ cards: await listPosts(getDb(), stage ? { stage } : {}) });
  } catch (err) {
    if (err instanceof BlogInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

// POST { title, slug?, category?, excerpt?, body?, note?, sourcePath? } — nyt kort
// i Idéer. Valideringen (titel, slug-format, længder, dublet-slug) ligger i
// createPost, så UI'et og agent-vejen deler præcis samme regler. Kilden bliver
// "manuel": den kommer fra sessionen, ikke fra payloaden.
export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const b = await jsonBody(req);
    return { post: await createPost(getDb(), b, actor) };
  });
}

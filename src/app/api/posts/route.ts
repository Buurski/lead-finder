import { getDb } from "@/lib/db/client";
import { createPost } from "@/lib/hq/posts";
import { hqWrite, jsonBody } from "@/lib/hq/api";

export const runtime = "nodejs";

// POST { title, slug?, category?, excerpt?, body?, note?, sourcePath? } — nyt kort
// i Idéer. Valideringen (titel, slug-format, længder, dublet-slug) ligger i
// createPost, så UI'et og agent-vejen deler præcis samme regler.
export async function POST(req: Request) {
  return hqWrite(req, async (actor) => {
    const b = await jsonBody(req);
    return { post: await createPost(getDb(), b, actor) };
  });
}

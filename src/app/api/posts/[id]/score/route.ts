import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { getPost } from "@/lib/hq/posts";
import { assessPost } from "@/lib/hq/post-score";
import { jevEnabled } from "@/lib/jev";
import { hqWrite, HqInputError, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

// POST — menneskets "Bedøm igen"-knap i idé-dialogen. Samme Jev-bedømmelse som
// baggrundskaldet ved oprettelse (post-score.ts), bare synkront og på
// forespørgsel. Uden TYPESAFE_API_KEY svares 503 med en dansk besked — UI'et
// viser "Jev ikke sat op" i stedet for at crashe.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!jevEnabled()) {
    return NextResponse.json({ error: "Jev er ikke sat op (mangler TYPESAFE_API_KEY)" }, { status: 503 });
  }
  return hqWrite(req, async () => {
    const { id } = await ctx.params;
    const post = await getPost(getDb(), uuid(id, "indlægs-id"));
    const scores = await assessPost(getDb(), post.id, { title: post.title, category: post.category, note: post.note });
    if (!scores) throw new HqInputError("Jev kunne ikke bedømme idéen lige nu — prøv igen om lidt");
    return { scores };
  });
}

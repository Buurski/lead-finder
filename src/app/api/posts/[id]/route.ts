import { getDb } from "@/lib/db/client";
import { deletePost, updatePost } from "@/lib/hq/posts";
import { hqWrite, jsonBody, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

// PATCH { title?, slug?, category?, excerpt?, body?, note?, sourcePath?, stage? } —
// stage-skift går gennem samme guards som agent-vejen (se hq/posts.ts). Actor er
// sessionens bruger ("lucas"/"charlie"), så et menneske kan sætte Publicer.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    return { post: await updatePost(getDb(), uuid(id, "indlægs-id"), await jsonBody(req), actor) };
  });
}

// DELETE — kun mennesker, og kun mens kortet står i Idéer eller Arbejder
// (guards ligger i deletePost). Agent-ruten har ingen delete-handling.
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    return { deleted: await deletePost(getDb(), uuid(id, "indlægs-id"), actor) };
  });
}

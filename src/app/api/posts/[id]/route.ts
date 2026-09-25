import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { BlogInputError, deletePost, getPost, updatePost } from "@/lib/hq/posts";
import { authorizedRead, hqWrite, jsonBody, uuid } from "@/lib/hq/api";

export const runtime = "nodejs";

// GET — fuld post inkl. body og beviser (kilder, FAQ, faktatjek) til dialogen.
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await authorizedRead(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json({ post: await getPost(getDb(), uuid(id, "indlægs-id")) });
  } catch (err) {
    if (err instanceof BlogInputError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}

// PATCH { title?, slug?, category?, excerpt?, body?, note?, sourcePath?, stage?,
// strengths?, scores?, proofs?, rating? } — stage-skift går gennem samme guards
// som agent-vejen (se hq/posts.ts). Actor er sessionens bruger ("lucas"/"charlie"),
// så et menneske kan sætte Publicer — og kun på en aktuel, grøn tjekliste.
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

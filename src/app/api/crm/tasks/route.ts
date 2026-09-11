import { NextResponse } from "next/server";
import { assertCrmMutationRequest, CrmInputError, deleteTask, listTasks, saveTask, updateTask } from "@/lib/crm";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof CrmInputError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "kunne ikke hente eller gemme opgave" }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const clientName = new URL(req.url).searchParams.get("clientName") ?? undefined;
    return NextResponse.json({ tasks: await listTasks(clientName) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    assertCrmMutationRequest(req);
    return NextResponse.json({ task: await saveTask(await req.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(req: Request) {
  try {
    assertCrmMutationRequest(req);
    const body = await req.json();
    if (typeof body.id !== "string" || typeof body.clientName !== "string" || typeof body.done !== "boolean") throw new CrmInputError("opgave-status er ugyldig");
    return NextResponse.json({ task: await updateTask(body.id, body.clientName, body.done) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    assertCrmMutationRequest(req);
    const params = new URL(req.url).searchParams;
    await deleteTask(params.get("id") ?? "", params.get("clientName") ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

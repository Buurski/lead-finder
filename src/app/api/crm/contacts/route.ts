import { NextResponse } from "next/server";
import { CrmInputError, assertCrmMutationRequest, deleteContact, listContacts, saveContact } from "@/lib/crm";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof CrmInputError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "kunne ikke hente eller gemme kontakt" }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const clientName = new URL(req.url).searchParams.get("clientName") ?? "";
    return NextResponse.json({ contacts: await listContacts(clientName) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    await assertCrmMutationRequest(req);
    return NextResponse.json({ contact: await saveContact(await req.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(req: Request) {
  try {
    await assertCrmMutationRequest(req);
    const url = new URL(req.url);
    await deleteContact(url.searchParams.get("clientName") ?? "", url.searchParams.get("id") ?? "");
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

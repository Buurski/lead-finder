import { NextResponse } from "next/server";
import { addActivity, assertCrmMutationRequest, CrmInputError, listActivities } from "@/lib/crm";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof CrmInputError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "kunne ikke hente eller gemme aktivitet" }, { status: 500 });
}

export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const clientName = params.get("clientName") ?? undefined;
    return NextResponse.json({ activities: await listActivities(clientName, Number(params.get("limit") ?? 60)) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(req: Request) {
  try {
    assertCrmMutationRequest(req);
    return NextResponse.json({ activity: await addActivity(await req.json()) });
  } catch (error) {
    return errorResponse(error);
  }
}

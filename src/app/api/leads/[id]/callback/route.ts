import { NextResponse } from "next/server";
import { updateCallbackDate } from "@/lib/sheets";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { date } = body;
    const rowIndex = Number(id) - 2;
    if (isNaN(rowIndex) || rowIndex < 0) {
      return NextResponse.json({ error: "Invalid lead ID" }, { status: 400 });
    }
    await updateCallbackDate(rowIndex, typeof date === "string" ? date : "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

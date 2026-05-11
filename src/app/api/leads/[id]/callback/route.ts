import { NextResponse } from "next/server";
import { updateCallbackDate } from "@/lib/sheets";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { date } = await req.json();
  const rowIndex = Number(id) - 2;
  await updateCallbackDate(rowIndex, date ?? "");
  return NextResponse.json({ ok: true });
}

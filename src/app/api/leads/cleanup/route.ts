import { NextResponse } from "next/server";
import { getLeads, deleteLeadRows } from "@/lib/sheets";
import { isChain } from "@/lib/chains";

// GET — preview which leads would be deleted (dry run)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const extra = searchParams.get("extra")?.split(",").filter(Boolean) ?? [];

  const leads = await getLeads();
  const matches = leads.filter((l) => isChain(l.name, extra));

  return NextResponse.json({
    count: matches.length,
    leads: matches.map((l) => ({ id: l.id, name: l.name, branch: l.branch, city: l.city, status: l.status })),
  });
}

// POST — delete chain leads. Pass { extra: ["keyword1", ...] } to add ad-hoc chain names.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const extra: string[] = Array.isArray(body.extra) ? body.extra : [];

  const leads = await getLeads();
  const toDelete = leads.filter((l) => isChain(l.name, extra));

  if (toDelete.length === 0) {
    return NextResponse.json({ deleted: 0, message: "No chain leads found" });
  }

  const sheetRowNumbers = toDelete.map((l) => Number(l.id));
  await deleteLeadRows(sheetRowNumbers);

  return NextResponse.json({
    deleted: toDelete.length,
    names: toDelete.map((l) => l.name),
  });
}

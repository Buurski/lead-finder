import { NextResponse } from "next/server";
import { updateLeadStatus, addClient, getLeads, type LeadStatus } from "@/lib/sheets";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { status, notes } = await req.json();
    const rowIndex = Number(id) - 2;

    await updateLeadStatus(rowIndex, status as LeadStatus, notes);

    if (status === "client") {
      const leads = await getLeads();
      const lead = leads.find((l) => l.id === id);
      if (lead) await addClient(lead);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}

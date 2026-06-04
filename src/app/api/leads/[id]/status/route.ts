import { NextResponse } from "next/server";
import { updateLeadStatus, addClient, getLeads, type LeadStatus } from "@/lib/sheets";
import { ensureClientNote } from "@/lib/client-notes";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { status, notes } = await req.json();
    const rowIndex = Number(id) - 2;

    await updateLeadStatus(rowIndex, status as LeadStatus, notes);

    let clientNote: ReturnType<typeof ensureClientNote> | undefined;
    if (status === "client") {
      const leads = await getLeads();
      const lead = leads.find((l) => l.id === id);
      if (lead) {
        await addClient(lead);
        // Seed the vault note for this new client (best-effort, never blocks).
        clientNote = ensureClientNote({ name: lead.name, branch: lead.branch, phone: lead.phone });
      }
    }

    return NextResponse.json({ ok: true, clientNote });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}

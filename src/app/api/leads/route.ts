import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";

export async function GET() {
  try {
    const leads = await getLeads();
    return NextResponse.json(leads);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}

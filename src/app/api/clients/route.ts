import { NextResponse } from "next/server";
import { getClients } from "@/lib/sheets";

export async function GET() {
  try {
    const clients = await getClients();
    return NextResponse.json(clients);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to fetch clients" }, { status: 500 });
  }
}

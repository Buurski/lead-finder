import { NextResponse } from "next/server";
import { getLeads, updateLeadStatus } from "@/lib/sheets";

export const maxDuration = 300;

const CHAIN_BLOCKLIST = [
  "profiloptik", "synoptik", "specsavers", "fielmann",
  "matas", "normal store", "søstrene grene", "flying tiger", "tiger stores",
  "jysk", "h&m", "zara", "elgiganten", "power electronics",
  "mcdonalds", "mcdonald's", "burger king", "subway", "7-eleven",
  "netto", "rema 1000", "lidl", "aldi", "bilka", "føtex", "kvickly",
  "silvan", "xl-byg", "stark",
  "shell", "circle k", "q8 energie", "ok benzin",
  "kvik køkken", "ikea",
];

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  return CHAIN_BLOCKLIST.some((chain) => lower.includes(chain));
}

export async function POST() {
  const leads = await getLeads();
  const targets = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => isChain(lead.name) && lead.status !== "skip" && lead.status !== "client");

  for (const { rowIndex } of targets) {
    await updateLeadStatus(rowIndex, "skip");
  }

  return NextResponse.json({
    skipped: targets.length,
    names: targets.map((t) => t.lead.name),
  });
}

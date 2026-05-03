import { NextResponse } from "next/server";
import { getLeads, updateLeadStatus } from "@/lib/sheets";

export const maxDuration = 300;

// Word-boundary safe chain detection
// EXACT: short words that appear inside other Danish words (e.g. "jysk" in "Midtjysk")
const CHAIN_EXACT = [
  "jysk", "netto", "lidl", "aldi", "zara", "ikea", "matas", "stark",
  "shell", "subway",
];
// CONTAINS: distinctive enough that substring match is safe
const CHAIN_CONTAINS = [
  "synoptik", "profiloptik", "specsavers", "fielmann",
  "elgiganten", "power electronics",
  "mcdonalds", "mcdonald's", "burger king", "7-eleven",
  "rema 1000", "bilka", "føtex", "kvickly",
  "silvan", "xl-byg",
  "circle k", "q8 energie", "ok benzin",
  "kvik køkken",
  "søstrene grene", "flying tiger", "tiger stores",
  "normal store", "h&m",
  "louis nielsen",
];

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  for (const chain of CHAIN_EXACT) {
    if (new RegExp(`\\b${chain}\\b`).test(lower)) return true;
  }
  for (const chain of CHAIN_CONTAINS) {
    if (lower.includes(chain)) return true;
  }
  return false;
}

// Names that were incorrectly skipped — restore these to "new"
const FALSE_POSITIVES = [
  "Midtjysk El Center",
  "Midtjysk Snedker- & Tømrerforretning",
  "Vestjysk Murerfirma ApS",
  "MidtJysk BoligService",
  "Midtjysk Rengøring Viborg",
  "Jysk System Rengøring A/S",
  "Vestjysk El ApS v/ Allan Aakerblad Jensen",
  "Jysk Rør og VVS",
  "Midtjysk Fysioterapi",
  "Jysk Service Erhverv ApS",
  "Ver Vestjysk Erhvervsrengøring v/Lars Gade",
  "Den Jyske Havemand ApS",
  "Midtjysk Have og Anlæg ApS",
  "Jysk Have og Anlæg ApS",
  "Vestjysk Anlægsservice",
  "Den Jyske Arborist",
  "Vestjysk Tømrerfirma",
  "Midtjysk Tømrer Service",
  "Østjysk Tømrer Aps",
  "Jysk El",
  "Midtjysk Boligventilation Aps",
  "Vestjysk Vikarservice",
  "Midtjysk Haveservice",
  "Jysk Hus & Anlæg",
  "MIDTJYSK REGNSKAB",
  "Café Garibaldi",
  "Cafe Vivaldi",
  "Vestjysk Skolefoto",
];

export async function POST() {
  const leads = await getLeads();

  // Restore false positives
  const restored: string[] = [];
  for (const { lead, rowIndex } of leads.map((l, i) => ({ lead: l, rowIndex: i }))) {
    if (FALSE_POSITIVES.some(fp => fp.toLowerCase() === lead.name.toLowerCase()) && lead.status === "skip") {
      await updateLeadStatus(rowIndex, "new");
      restored.push(lead.name);
    }
  }

  // Skip remaining true chains (that aren't already skipped)
  const skipped: string[] = [];
  for (const { lead, rowIndex } of leads.map((l, i) => ({ lead: l, rowIndex: i }))) {
    if (isChain(lead.name) && lead.status !== "skip" && lead.status !== "client") {
      await updateLeadStatus(rowIndex, "skip");
      skipped.push(lead.name);
    }
  }

  return NextResponse.json({ restored, skipped });
}

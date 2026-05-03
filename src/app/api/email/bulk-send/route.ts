import { NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus, updateLeadStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";

export const maxDuration = 300;

function getTier(score: number): "A" | "B" | "C" {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
}

const CHAIN_EXACT = [
  "jysk", "netto", "lidl", "aldi", "zara", "ikea", "matas", "stark", "shell", "subway",
];
const CHAIN_CONTAINS = [
  "synoptik", "profiloptik", "specsavers", "fielmann",
  "elgiganten", "power electronics",
  "mcdonalds", "mcdonald's", "burger king", "7-eleven",
  "rema 1000", "bilka", "føtex", "kvickly",
  "silvan", "xl-byg",
  "circle k", "q8 energie", "ok benzin",
  "kvik køkken", "søstrene grene", "flying tiger", "tiger stores",
  "normal store", "h&m", "louis nielsen",
];

function isChain(name: string): boolean {
  const lower = name.toLowerCase();
  for (const chain of CHAIN_EXACT) {
    if (new RegExp(`\\b${chain}\\b`).test(lower)) return true;
  }
  return CHAIN_CONTAINS.some((chain) => lower.includes(chain));
}

export async function GET() {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const leads = await getLeads();
  const count = leads.filter(
    (l) =>
      l.email &&
      emailRegex.test(l.email) &&
      !l.emailSentAt &&
      (getTier(l.score) === "A" || getTier(l.score) === "B") &&
      l.status !== "skip" &&
      l.status !== "client" &&
      l.websiteQualityTier !== "modern" &&
      !isChain(l.name)
  ).length;
  return NextResponse.json({ count });
}

export async function POST() {
  const leads = await getLeads();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) =>
      lead.email &&
      emailRegex.test(lead.email) &&
      !lead.emailSentAt &&
      (getTier(lead.score) === "A" || getTier(lead.score) === "B") &&
      lead.status !== "skip" &&
      lead.status !== "client" &&
      lead.websiteQualityTier !== "modern" &&
      !isChain(lead.name)
    );

  const results: { name: string; email: string; ok: boolean; error?: string }[] = [];

  for (const { lead, rowIndex } of eligible) {
    try {
      await sendLeadEmail(lead, "cold");
      const now = new Date().toISOString();
      await updateLeadEmailStatus(rowIndex, {
        emailSentAt: now,
        emailStatus: "sent",
      });
      if (lead.status === "new") {
        await updateLeadStatus(rowIndex, "called");
      }
      results.push({ name: lead.name, email: lead.email, ok: true });
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      results.push({ name: lead.name, email: lead.email, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}

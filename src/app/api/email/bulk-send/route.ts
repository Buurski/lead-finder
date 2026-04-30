import { NextResponse } from "next/server";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";

function getTier(score: number): "A" | "B" | "C" {
  if (score >= 70) return "A";
  if (score >= 40) return "B";
  return "C";
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
      l.status !== "client"
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
      lead.status !== "client"
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

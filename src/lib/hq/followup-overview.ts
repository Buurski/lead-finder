// Opfølgnings-overblik til virksomhedsprofilen: hvor mange mails er sendt og
// hvor i sekvensen virksomheden står. Læser den delte kø (src/lib/queue.ts,
// pg- eller sheets-bagvedliggende) i stedet for at duplikere sequence.ts'
// forretningslogik — se docs/superpowers/plans/2026-09-22-crm-hq-fase-2-skal-hq.md
// Task 4. Ny fil (rører ikke queue.ts/sequence.ts, som jeg ikke ejer).
import "server-only";
import { readQueue } from "../queue.ts";
import { DEFAULT_TOUCHES, ANGLE_LABEL, type Angle } from "./sequence.ts";

export interface FollowUpOverview {
  sent: number;
  step: number | null;
  maxTouches: number;
  angleLabel: string | null;
  stoppedReason: string | null;
  lastSentAt: string | null;
}

/** companyRowNo = company.rowNo (legacy Sheets-rækkenummer, delt nøgle med køen). */
export async function getFollowUpOverview(companyRowNo: number, maxTouches?: number | null): Promise<FollowUpOverview> {
  const mine = (await readQueue()).filter((d) => d.leadId === String(companyRowNo) && d.source === "opfoelgning");
  const sent = mine.filter((d) => d.status === "sent");
  const latest = [...mine].sort((a, b) => (b.step ?? 0) - (a.step ?? 0) || b.updatedAt.localeCompare(a.updatedAt))[0];
  const stopped = mine.find((d) => d.stoppedReason);
  return {
    sent: sent.length,
    step: latest?.step ?? null,
    maxTouches: maxTouches ?? DEFAULT_TOUCHES,
    angleLabel: latest?.angle ? (ANGLE_LABEL[latest.angle as Angle] ?? latest.angle) : null,
    stoppedReason: stopped?.stoppedReason ?? null,
    lastSentAt: sent.length ? sent.map((d) => d.updatedAt).sort().at(-1)! : null,
  };
}

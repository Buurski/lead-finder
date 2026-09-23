// Maskin-poster ind i CRM'et (spec §6): Hermes' team-check-in, Claude/Codex/Hermes
// "færdig: X" og deploy-signaler. Kun små, validerede aktiviteter — aldrig andet.
import { and, eq, ilike, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";

export const AGENT_ACTORS = ["hermes", "claude", "codex", "lucas", "charlie"] as const;
export const AGENT_TYPES = ["session", "checkin", "deploy"] as const;
export class AgentLogError extends Error {}

export interface AgentLogInput {
  actor: string;
  type: string;
  summary: string;
  company?: string; // uuid eller kundenavn — valgfri
  url?: string;
}

export async function logAgentEntry(db: Db, input: AgentLogInput): Promise<{ id: string; companyId: string | null }> {
  const actor = String(input.actor ?? "").toLowerCase();
  const type = String(input.type ?? "");
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  if (!(AGENT_ACTORS as readonly string[]).includes(actor)) throw new AgentLogError("ukendt actor");
  if (!(AGENT_TYPES as readonly string[]).includes(type)) throw new AgentLogError("ukendt type");
  if (!summary || summary.length > 1000) throw new AgentLogError("summary mangler eller er for lang");
  if (type === "checkin" && actor !== "lucas" && actor !== "charlie") throw new AgentLogError("check-in er kun for Lucas og Charlie");
  const url = typeof input.url === "string" && /^https:\/\/[^\s]{1,300}$/.test(input.url) ? input.url : undefined;

  let companyId: string | null = null;
  const ref = typeof input.company === "string" ? input.company.trim() : "";
  if (ref) {
    if (/^[0-9a-f-]{36}$/i.test(ref)) {
      const [c] = await db.select({ id: company.id }).from(company).where(eq(company.id, ref));
      companyId = c?.id ?? null;
    } else if (ref.length <= 120) {
      // Kun entydige kundenavne — et tvetydigt navn hæftes ikke på nogen.
      const hits = await db
        .select({ id: company.id })
        .from(company)
        .where(and(isNotNull(company.clientNo), ilike(company.name, ref.replace(/[%_\\]/g, "\\$&"))));
      companyId = hits.length === 1 ? hits[0].id : null;
    }
  }
  const [row] = await db
    .insert(activity)
    .values({ companyId, actor, type, summary, payload: url ? { url } : null })
    .returning({ id: activity.id });
  return { id: row.id, companyId };
}

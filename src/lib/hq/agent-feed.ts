// "Seneste fra agenterne" (/agenter): maskin-poster fra activity — session/deploy
// hændelser, eller alt hvad en agent-aktør selv har logget. Ny fil (rører ikke
// summary.ts, som allerede dækker Team/Penge og som jeg ikke ejer).
import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";
import { AGENT_ACTORS } from "./agent-log.ts";

export interface AgentFeedRow {
  id: string;
  actor: string;
  type: string;
  summary: string;
  companyId: string | null;
  companyName: string | null;
  at: string;
}

const AGENT_TYPES = ["session", "deploy"] as const;
// Check-ins er menneskelige (Lucas/Charlie), ikke en agent-post — udelades her.
const AGENT_ONLY_ACTORS = AGENT_ACTORS.filter((a) => a !== "lucas" && a !== "charlie");

/** Seneste `limit` agent-poster, nyeste først. Kunde-navn med, hvis knyttet. */
export async function getAgentFeed(db: Db, limit = 20): Promise<AgentFeedRow[]> {
  const rows = await db
    .select({
      id: activity.id,
      actor: activity.actor,
      type: activity.type,
      summary: activity.summary,
      companyId: activity.companyId,
      companyName: company.name,
      at: activity.at,
    })
    .from(activity)
    .leftJoin(company, eq(company.id, activity.companyId))
    .where(and(or(inArray(activity.type, AGENT_TYPES), inArray(activity.actor, AGENT_ONLY_ACTORS))))
    .orderBy(desc(activity.at))
    .limit(limit);

  return rows.map((r) => ({ ...r, at: r.at.toISOString() }));
}

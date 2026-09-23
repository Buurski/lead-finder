// Svar besvaret (bølge 3, opgave "svar HELT fra CRM'et"): registrerer udfaldet
// af et besvaret lead-svar ét sted, så ingen glemmer at opdatere lead-status,
// tidslinje eller opfølgning. Egen fejlklasse (ikke HqInputError — den importerer
// next/server, som node:test ikke kan resolve uden for Next's runtime); ruten
// oversætter selv (samme mønster som onboarding.ts/OnboardingError).
import "server-only";
import { and, eq, gte } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, task } from "../db/schema.ts";
import { stopOpenForRows } from "../pg/queue.ts";

export class ReplyOutcomeError extends Error {}

export type ReplyOutcome = "interesseret" | "ikke-interesseret" | "ring-op" | "kunde-spoergsmaal" | "andet";

// Charlie-venlige udfaldstekster — indgår i tidslinje-opslaget.
const OUTCOME_LABEL: Record<ReplyOutcome, string> = {
  interesseret: "interesseret",
  "ikke-interesseret": "ikke interesseret",
  "ring-op": "skal ringes op",
  "kunde-spoergsmaal": "har et spørgsmål",
  andet: "andet",
};

// Kun disse to udfald flytter lead-status; "ring-op"/"kunde-spoergsmaal"/"andet"
// rører den ikke (opgaven: "behold" / "uændret"). En kunde (client_no sat)
// må ALDRIG få ændret lead_status, uanset udfald — tjekket nedenfor.
const LEAD_STATUS: Partial<Record<ReplyOutcome, string>> = {
  interesseret: "interested",
  "ikke-interesseret": "not-interested",
};

export interface RecordReplyOutcomeInput {
  leadId: string; // company.row_no (tal-streng) ELLER company.place_id
  outcome: ReplyOutcome;
  note?: string;
  followUpDue?: string; // YYYY-MM-DD
  owner: "lucas" | "charlie";
  actor: string;
}

export interface RecordReplyOutcomeResult {
  companyId: string;
  activityId: string;
  leadStatus: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Registrerer at et lead-svar er besvaret: sætter lead-status (medmindre
 * virksomheden er kunde), stopper åbne kolde kladder/opfølgninger, logger
 * tidslinjen (læses som "vi sendte" af kundeoverblikket, se overview.ts
 * mailDirection/OUT — summary starter derfor med "Svar sendt til"), og
 * opretter en opfølgnings-opgave hvis relevant. Idempotent: samme udfald for
 * samme virksomhed inden for 1 minut logger/opretter ikke igen (dobbeltklik). */
export async function recordReplyOutcome(db: Db, input: RecordReplyOutcomeInput): Promise<RecordReplyOutcomeResult> {
  if (!(input.outcome in OUTCOME_LABEL)) throw new ReplyOutcomeError("ukendt udfald");
  const note = (input.note ?? "").trim();
  if (note.length > 2000) throw new ReplyOutcomeError("noten er for lang");
  if (input.followUpDue !== undefined && input.followUpDue !== "" && !DATE_RE.test(input.followUpDue)) {
    throw new ReplyOutcomeError("ugyldig opfølgningsdato");
  }
  const owner = input.owner === "charlie" ? "charlie" : "lucas";

  const isNumeric = /^\d+$/.test(input.leadId);
  const [c] = isNumeric
    ? await db.select().from(company).where(eq(company.rowNo, Number(input.leadId)))
    : await db.select().from(company).where(eq(company.placeId, input.leadId));
  if (!c) throw new ReplyOutcomeError("virksomheden findes ikke");

  // "Svar sendt til …" matcher overview.ts's OUT-regex (^svar sendt), så
  // kundeoverblikkets "hvem venter på hvem" vender rigtigt.
  const summary = `Svar sendt til ${c.name || "leadet"}: ${OUTCOME_LABEL[input.outcome]}${note ? ` — ${note}` : ""}`;

  // Et svar betyder altid stop for kolde mails — også ved dobbeltklik (harmløst, ingen åbne rækker anden gang).
  await stopOpenForRows([c.rowNo], "svar modtaget", new Date().toISOString());

  // Idempotens: samme lead+udfald-tekst inden for 1 minut → ingen ekstra aktivitet/opgave.
  const oneMinAgo = new Date(Date.now() - 60_000);
  const [dup] = await db
    .select({ id: activity.id })
    .from(activity)
    .where(and(eq(activity.companyId, c.id), eq(activity.type, "email"), eq(activity.summary, summary), gte(activity.at, oneMinAgo)))
    .limit(1);
  if (dup) return { companyId: c.id, activityId: dup.id, leadStatus: c.leadStatus };

  const isClient = c.clientNo !== null && !c.clientRemoved;
  const newStatus = !isClient ? LEAD_STATUS[input.outcome] : undefined;
  if (newStatus && newStatus !== c.leadStatus) {
    await db.update(company).set({ leadStatus: newStatus, updatedAt: new Date() }).where(eq(company.id, c.id));
  }

  const [row] = await db.insert(activity).values({ companyId: c.id, actor: input.actor, type: "email", summary }).returning({ id: activity.id });

  // "ring-op" opretter altid sin egen opkalds-opgave (bruger followUpDue som dato hvis sat).
  // For de andre udfald er en opfølgningsopgave valgfri — kun når en dato er valgt.
  if (input.outcome === "ring-op") {
    await db.insert(task).values({ companyId: c.id, clientName: c.name, owner, title: `Ring til ${c.name}`, due: input.followUpDue || tomorrow() });
  } else if (input.followUpDue) {
    await db.insert(task).values({ companyId: c.id, clientName: c.name, owner, title: `Følg op: ${c.name}`, due: input.followUpDue });
  }

  return { companyId: c.id, activityId: row.id, leadStatus: newStatus ?? c.leadStatus };
}

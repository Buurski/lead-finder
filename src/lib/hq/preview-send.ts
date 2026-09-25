// Afsendelse af et færdigt gratis udkast. Kun på klik fra Lucas/Charlie efter de
// har set udkastet — aldrig automatisk. Ét udkast sendes højst én gang: kravet
// tages som en unik activity-række i Postgres FØR mailen går, og frigives hvis
// afsendelsen fejler MED SIKKERHED før Gmail tog mailen (tvetydig fejl ⇒ kravet står og afstemmes).
import { and, eq, like, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity } from "../db/schema.ts";
import { failedBeforeAccept } from "../send-safety.ts";

export class PreviewSendError extends Error {}

export const SENDABLE = ["preview klar", "godkendt", "kladde klar"] as const;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export interface PreviewLike {
  id: string;
  company: string;
  email: string;
  status: string;
  previewUrl?: string;
}

export interface SendDeps {
  get: (id: string) => Promise<PreviewLike | null>;
  deliver: (msg: { to: string; subject: string; body: string }) => Promise<void>;
  markSent: (id: string, body: string) => Promise<void>;
}

export async function sendPreview(
  db: Db,
  id: string,
  input: { subject: string; body: string },
  actor: string,
  deps: SendDeps,
): Promise<void> {
  const r = await deps.get(id);
  if (!r) throw new PreviewSendError("udkastet findes ikke");
  if (!(SENDABLE as readonly string[]).includes(r.status)) throw new PreviewSendError(`kan ikke sendes i status "${r.status}"`);
  if (!r.previewUrl) throw new PreviewSendError("udkastet har intet link endnu");
  const to = r.email.trim();
  if (!EMAIL.test(to)) throw new PreviewSendError("modtagerens mail er ugyldig");
  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || subject.length > 200) throw new PreviewSendError("emne mangler eller er for langt");
  if (!body || body.length > 5000) throw new PreviewSendError("teksten mangler eller er for lang");
  if (!body.includes(r.previewUrl)) throw new PreviewSendError("mailen skal indeholde linket til udkastet");

  const [link] = await db.select({ companyId: activity.companyId }).from(activity).where(eq(activity.legacyId, `preview:${id}`));
  const legacyId = `preview-sent:${id}`;
  // Kravet fødes som state "sending" og er låst. Kun et UDTRYKKELIGT registreret tvetydigt SMTP-udfald
  // ("uncertain") kan frigives; fejler den registrering eller "sent"-skrivningen, forbliver kravet låst (Sol R5-1).
  const claimed = await db
    .insert(activity)
    .values({
      legacyId,
      companyId: link?.companyId ?? null,
      clientName: r.company,
      actor,
      // Et forsøg — bliver først "udkast_sendt" når Gmail har taget mailen (Sol R6-F2).
      type: "udkast_forsoeg",
      summary: `Forsøg på at sende gratis udkast til ${to}`,
      payload: { previewId: id, previewUrl: r.previewUrl, subject, state: "sending" },
    })
    .onConflictDoNothing()
    .returning({ id: activity.id });
  if (!claimed.length) throw new PreviewSendError("udkastet er allerede sendt");

  try {
    await deps.deliver({ to, subject, body });
  } catch (err) {
    const msg = String((err as Error)?.message ?? err).slice(0, 120);
    // Kun sikre før-accept-fejl (og vores egne afvisninger før SMTP) frigiver kravet.
    // En timeout efter DATA kan betyde at mailen ER ude — så må et nyt klik ikke sende igen (Sol bølge 2 R2).
    if (err instanceof PreviewSendError || failedBeforeAccept(err)) {
      await db.delete(activity).where(and(eq(activity.legacyId, legacyId), eq(activity.id, claimed[0].id), SENDING));
      throw new PreviewSendError(`mailen kunne ikke sendes: ${msg}`);
    }
    console.error(JSON.stringify({ evt: "preview.uncertain_send", id, to, error: msg }));
    // Registrér udfaldet. Fejler det, står kravet som "sending" (låst) — kan kun bekræftes som sendt.
    await db
      .update(activity)
      .set({ payload: sql`${activity.payload} || '{"state":"uncertain"}'::jsonb` })
      .where(and(eq(activity.id, claimed[0].id), SENDING))
      .catch((e) => console.error(JSON.stringify({ evt: "preview.uncertain_mark_failed", id, error: String(e).slice(0, 200) })));
    throw new PreviewSendError(`usikkert om mailen gik ud (${msg}) — tjek Gmail Sendt, og afstem derefter`);
  }
  // Mailen er ude. Fejler en af de to skrivninger, står kravet låst som "sending" (intet gensend) og kan bekræftes som sendt.
  await db
    .update(activity)
    .set({ ...SENT_ROW(to), payload: sql`${activity.payload} || '{"state":"sent"}'::jsonb` })
    .where(and(eq(activity.id, claimed[0].id), SENDING))
    .catch((err) => console.error(JSON.stringify({ evt: "preview.claim_state_failed", id, error: String(err).slice(0, 200) })));
  await deps.markSent(id, body).catch((err) =>
    console.error(JSON.stringify({ evt: "preview.mark_sent_failed", id, error: String(err).slice(0, 200) })),
  );
}

const STATE = sql<string | null>`${activity.payload}->>'state'`;
const SENDING = sql`${STATE} = 'sending'`;
// Tvetydigt SMTP-udfald, registreret. (payload.uncertain=true er formen fra b1fd633, aldrig deployet.)
const UNCERTAIN = sql`(${STATE} = 'uncertain' or (${STATE} is null and ${activity.payload}->>'uncertain' = 'true'))`;
// Et "sending"-krav kan kun bekræftes når forsøget ikke kan køre længere (ruten har maxDuration 60 s) — Sol R6-F1.
export const SETTLE_MS = 2 * 60_000;
const SENT_ROW = (to?: string) => ({ type: "udkast_sendt", summary: to ? `Gratis udkast sendt til ${to}` : "Gratis udkast sendt" });

/**
 * Afstemning efter et usikkert forsøg: Lucas har tjekket Gmail Sendt.
 * "not-sent" ⇒ frigiver KUN et registreret usikkert krav (aldrig "sending": dér er udfaldet ukendt).
 * "sent" ⇒ låser kravet som sendt og markerer udkastet; idempotent, så en fejlet status-skrivning kan gentages.
 * Hver overgang er én betinget sætning — modsatte klik kan ikke begge vinde (Sol R4-5).
 */
export async function reconcilePreview(
  db: Db,
  id: string,
  verdict: "sent" | "not-sent",
  markSent: (id: string) => Promise<void>,
  nowMs = Date.now(),
): Promise<void> {
  const legacyId = `preview-sent:${id}`;
  if (verdict === "not-sent") {
    const gone = await db.delete(activity).where(and(eq(activity.legacyId, legacyId), UNCERTAIN)).returning({ id: activity.id });
    if (!gone.length) throw new PreviewSendError(await whyNot(db, legacyId));
    return;
  }
  const settledSending = and(SENDING, lt(activity.at, new Date(nowMs - SETTLE_MS)));
  const done = await db
    .update(activity)
    .set({ ...SENT_ROW(), payload: sql`(${activity.payload} - 'uncertain') || '{"state":"sent"}'::jsonb` })
    .where(and(eq(activity.legacyId, legacyId), or(UNCERTAIN, settledSending)))
    .returning({ id: activity.id });
  if (!done.length) {
    const [row] = await db.select({ state: STATE }).from(activity).where(eq(activity.legacyId, legacyId));
    if (!row) throw new PreviewSendError("der er intet afsendelsesforsøg at bekræfte");
    if (row.state === "sending") throw new PreviewSendError("forsøget kan stadig være i gang — vent 2 minutter og prøv igen");
    // Allerede sendt (eller et ældre krav uden state): gentag bare status-skrivningen.
  }
  await markSent(id);
}

async function whyNot(db: Db, legacyId: string): Promise<string> {
  const [row] = await db.select({ state: STATE }).from(activity).where(eq(activity.legacyId, legacyId));
  if (!row) return "der er intet afsendelsesforsøg at frigive";
  if (row.state === "sending") return "udfaldet er ikke registreret (forsøget kan være i gang eller afbrudt) — kan kun bekræftes som sendt; frigivelse kræver manuel afklaring";
  return "udkastet er sendt — det kan ikke frigives";
}

export type PreviewClaim = "sending" | "uncertain" | "sent";

/** Krav pr. preview-id til UI'et. Ældre krav uden state tæller som sendt. */
export async function previewClaims(db: Db): Promise<Map<string, PreviewClaim>> {
  const rows = await db
    .select({ legacyId: activity.legacyId, state: STATE, uncertain: sql<string | null>`${activity.payload}->>'uncertain'` })
    .from(activity)
    .where(like(activity.legacyId, "preview-sent:%"));
  return new Map(
    rows.map((row): [string, PreviewClaim] => [
      String(row.legacyId).slice("preview-sent:".length),
      row.state === "sending" ? "sending" : row.state === "uncertain" || (!row.state && row.uncertain === "true") ? "uncertain" : "sent",
    ]),
  )
}

/** Uafklaret krav ("sending"/"uncertain") på et udkast: status må ikke ændres før det er afstemt (Sol R6-F3). */
export async function hasOpenClaim(db: Db, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: activity.id })
    .from(activity)
    .where(and(eq(activity.legacyId, `preview-sent:${id}`), sql`(${STATE} = 'sending' or ${UNCERTAIN})`));
  return Boolean(row);
}

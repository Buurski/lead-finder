// Afsendelse af et færdigt gratis udkast. Kun på klik fra Lucas/Charlie efter de
// har set udkastet — aldrig automatisk. Ét udkast sendes højst én gang: kravet
// tages som en unik activity-række i Postgres FØR mailen går, og frigives hvis
// afsendelsen fejler MED SIKKERHED før Gmail tog mailen (tvetydig fejl ⇒ kravet står og afstemmes).
import { and, eq, like, lt, or, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, task } from "../db/schema.ts";
import { failedBeforeAccept, withLock } from "../send-safety.ts";

export class PreviewSendError extends Error {}

/** Én lås pr. udkast: status-ændring (PATCH) og send-reservation kan ikke flette ind i hinanden (Sol R7-02). */
export const previewLockName = (id: string) => `preview:${id}`;

export const SENDABLE = ["preview klar", "godkendt", "kladde klar"] as const;
const CLOSED = ["afvist", "sendt/lukket"];

/** SEO-tjek-henvendelser har ingen demo: de besvares med rapportmailen og kan sendes, så snart de er kommet ind (E2E 25/9). */
export function isSendable(r: { status: string; previewUrl?: string; seoTjek?: unknown }): boolean {
  if (r.seoTjek) return !CLOSED.includes(r.status);
  return (SENDABLE as readonly string[]).includes(r.status) && Boolean(r.previewUrl);
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Samme tekstkrav i send og forhåndsvisning, så forhåndsvisningen aldrig viser en mail send-ruten afviser (Sol w4a R2). */
export function previewBodyError(body: string, previewUrl: string | undefined, seoReport = false): string | null {
  const b = body.trim();
  if (!b || b.length > 5000) return "teksten mangler eller er for lang";
  if (seoReport) return null; // rapportmailen har intet demo-link
  if (!previewUrl) return "udkastet har intet link endnu";
  if (!b.includes(previewUrl)) return "mailen skal indeholde linket til udkastet";
  return null;
}

export interface PreviewLike {
  id: string;
  company: string;
  email: string;
  status: string;
  previewUrl?: string;
  seoTjek?: unknown;
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
  const { to, subject, legacyId, claimed } = await withLock(previewLockName(id), async () => {
    const r = await deps.get(id);
    if (!r) throw new PreviewSendError("udkastet findes ikke");
    if (!isSendable(r)) throw new PreviewSendError(r.previewUrl || r.seoTjek ? `kan ikke sendes i status "${r.status}"` : "udkastet har intet link endnu");
    const to = r.email.trim();
    if (!EMAIL.test(to)) throw new PreviewSendError("modtagerens mail er ugyldig");
    const subject = input.subject.trim();
    const body = input.body.trim();
    if (!subject || subject.length > 200) throw new PreviewSendError("emne mangler eller er for langt");
    const bodyErr = previewBodyError(body, r.previewUrl, Boolean(r.seoTjek));
    if (bodyErr) throw new PreviewSendError(bodyErr);

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
    return { to, subject, legacyId, claimed };
  });
  const body = input.body.trim();

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
  await closeInboundTask(db, id);
}

/** Svaret er sendt ⇒ "Svar på henvendelse"-opgaven fra inbound.ts lukkes. Fejler det, står opgaven bare åben. */
export async function closeInboundTask(db: Db, previewId: string): Promise<void> {
  await db
    .update(task)
    .set({ doneAt: new Date() })
    .where(and(eq(task.legacyId, `inbound:${previewId}`), sql`${task.doneAt} is null`))
    .catch((err) => console.error(JSON.stringify({ evt: "preview.close_task_failed", id: previewId, error: String(err).slice(0, 200) })));
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
  await closeInboundTask(db, id);
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

/** Må udkastets status ændres til `target`? Intet krav ⇒ ja. Et sendt krav er endeligt: kun "sendt/lukket"
 *  uden feltændringer (idempotent) er tilladt. Et uafklaret krav ("sending"/"uncertain") skal afstemmes først (Sol R6-F3, R8-02). */
export async function claimBlocksStatus(db: Db, id: string, target: string, hasEdits = false): Promise<boolean> {
  const [row] = await db
    .select({ state: STATE, uncertain: sql<string | null>`${activity.payload}->>'uncertain'` })
    .from(activity)
    .where(eq(activity.legacyId, `preview-sent:${id}`));
  if (!row) return false;
  const sent = row.state === "sent" || (!row.state && row.uncertain !== "true");
  return !(sent && target === "sendt/lukket" && !hasEdits); // sendt ⇒ kun status, ingen feltændringer (R9-02)
}

/** Uafklaret krav ("sending"/"uncertain") på et udkast: status må ikke ændres før det er afstemt (Sol R6-F3). */
export async function hasOpenClaim(db: Db, id: string): Promise<boolean> {
  const [row] = await db
    .select({ id: activity.id })
    .from(activity)
    .where(and(eq(activity.legacyId, `preview-sent:${id}`), sql`(${STATE} = 'sending' or ${UNCERTAIN})`));
  return Boolean(row);
}

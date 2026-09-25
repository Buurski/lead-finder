// Afsendelse af et færdigt gratis udkast. Kun på klik fra Lucas/Charlie efter de
// har set udkastet — aldrig automatisk. Ét udkast sendes højst én gang: kravet
// tages som en unik activity-række i Postgres FØR mailen går, og frigives hvis
// afsendelsen fejler MED SIKKERHED før Gmail tog mailen (tvetydig fejl ⇒ kravet står som "pending" og afstemmes).
import { and, eq, like, lt, sql } from "drizzle-orm";
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
  // Kravet fødes som state "pending" — tilstanden er en del af selve kravet (Sol R4-3), ikke en
  // efterfølgende skrivning der kan fejle. "sent" sættes når Gmail har taget mailen.
  const claimed = await db
    .insert(activity)
    .values({
      legacyId,
      companyId: link?.companyId ?? null,
      clientName: r.company,
      actor,
      type: "udkast_sendt",
      summary: `Gratis udkast sendt til ${to}`,
      payload: { previewId: id, previewUrl: r.previewUrl, subject, state: "pending" },
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
      await db.delete(activity).where(and(eq(activity.legacyId, legacyId), eq(activity.id, claimed[0].id)));
      throw new PreviewSendError(`mailen kunne ikke sendes: ${msg}`);
    }
    // Kravet står som "pending" ⇒ usikkert; afstemmes med reconcilePreview.
    console.error(JSON.stringify({ evt: "preview.uncertain_send", id, to, error: msg }));
    throw new PreviewSendError(`usikkert om mailen gik ud (${msg}) — tjek Gmail Sendt, og afstem derefter`);
  }
  // Mailen er ude. Fejler en af de to skrivninger, står kravet stadig (intet gensend) og kan afstemmes som "sendt".
  await db
    .update(activity)
    .set({ payload: sql`${activity.payload} || '{"state":"sent"}'::jsonb` })
    .where(eq(activity.id, claimed[0].id))
    .catch((err) => console.error(JSON.stringify({ evt: "preview.claim_state_failed", id, error: String(err).slice(0, 200) })));
  await deps.markSent(id, body).catch((err) =>
    console.error(JSON.stringify({ evt: "preview.mark_sent_failed", id, error: String(err).slice(0, 200) })),
  );
}

// Et krav der stadig er "pending" efter dette er ikke i gang (ruten har maxDuration 60 s) — det er usikkert.
export const RECONCILE_AFTER_MS = 2 * 60_000;
const PENDING = sql`${activity.payload}->>'state' = 'pending'`;

/**
 * Afstemning efter et usikkert forsøg: Lucas har tjekket Gmail Sendt.
 * "not-sent" ⇒ kravet frigives (kun et usikkert krav, og kun ét der ikke kan være i gang).
 * "sent" ⇒ kravet låses som sendt og udkastet markeres sendt; idempotent, så en fejlet status-skrivning kan gentages.
 * Hver overgang er én betinget sætning på state='pending' — modsatte klik kan ikke begge vinde (Sol R4-5).
 */
export async function reconcilePreview(
  db: Db,
  id: string,
  verdict: "sent" | "not-sent",
  markSent: (id: string) => Promise<void>,
  nowMs = Date.now(),
): Promise<void> {
  const legacyId = `preview-sent:${id}`;
  const settled = lt(activity.at, new Date(nowMs - RECONCILE_AFTER_MS));
  const mine = and(eq(activity.legacyId, legacyId), PENDING, settled);
  if (verdict === "not-sent") {
    const gone = await db.delete(activity).where(mine).returning({ id: activity.id });
    if (!gone.length) throw new PreviewSendError(await whyNot(db, legacyId, "frigive"));
    return;
  }
  const done = await db
    .update(activity)
    .set({ payload: sql`${activity.payload} || '{"state":"sent"}'::jsonb` })
    .where(mine)
    .returning({ id: activity.id });
  if (!done.length) {
    const [row] = await db.select({ state: sql<string | null>`${activity.payload}->>'state'` }).from(activity).where(eq(activity.legacyId, legacyId));
    if (!row || row.state === "pending") throw new PreviewSendError(await whyNot(db, legacyId, "bekræfte"));
    // Allerede sendt (eller et ældre krav uden state): gentag bare status-skrivningen.
  }
  await markSent(id);
}

async function whyNot(db: Db, legacyId: string, verb: string): Promise<string> {
  const [row] = await db.select({ state: sql<string | null>`${activity.payload}->>'state'` }).from(activity).where(eq(activity.legacyId, legacyId));
  if (!row) return `der er intet afsendelsesforsøg at ${verb}`;
  if (row.state === "pending") return "forsøget kan stadig være i gang — vent 2 minutter og prøv igen";
  return "udkastet er sendt — det kan ikke frigives";
}

/** Krav pr. preview-id til UI'et: "pending" = usikkert/i gang, "sent" = sendt. Ældre krav uden state tæller som sendt. */
export async function previewClaims(db: Db): Promise<Map<string, "pending" | "sent">> {
  const rows = await db
    .select({ legacyId: activity.legacyId, state: sql<string | null>`${activity.payload}->>'state'` })
    .from(activity)
    .where(like(activity.legacyId, "preview-sent:%"));
  return new Map(rows.map((r) => [String(r.legacyId).slice("preview-sent:".length), r.state === "pending" ? "pending" : "sent"]));
}

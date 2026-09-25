// Afsendelse af et færdigt gratis udkast. Kun på klik fra Lucas/Charlie efter de
// har set udkastet — aldrig automatisk. Ét udkast sendes højst én gang: kravet
// tages som en unik activity-række i Postgres FØR mailen går, og frigives hvis
// afsendelsen fejler MED SIKKERHED før Gmail tog mailen (tvetydig fejl ⇒ kravet står).
import { and, eq } from "drizzle-orm";
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
  const claimed = await db
    .insert(activity)
    .values({
      legacyId,
      companyId: link?.companyId ?? null,
      clientName: r.company,
      actor,
      type: "udkast_sendt",
      summary: `Gratis udkast sendt til ${to}`,
      payload: { previewId: id, previewUrl: r.previewUrl, subject },
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
    console.error(JSON.stringify({ evt: "preview.uncertain_send", id, to, error: msg }));
    throw new PreviewSendError(`usikkert om mailen gik ud (${msg}) — tjek Gmail Sendt før du prøver igen; udkastet står som sendt`);
  }
  // Mailen er ude; status-fejl må ikke få nogen til at sende igen (kravet står).
  await deps.markSent(id, body).catch((err) =>
    console.error(JSON.stringify({ evt: "preview.mark_sent_failed", id, error: String(err).slice(0, 200) })),
  );
}

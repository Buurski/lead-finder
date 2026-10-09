import { getDb } from "@/lib/db/client";
import { addressSuppressed } from "@/lib/canSendTo";
import { getLeads } from "@/lib/sheets";
import { hqWrite, HqInputError, jsonBody } from "@/lib/hq/api";
import { PreviewSendError, reconcilePreview, sendPreview } from "@/lib/hq/preview-send";
import { readPreviewRequests, updatePreviewStatus, type SeoTjekResult } from "@/lib/preview-queue";
import { DAILY_SEND_CAP, takeDailyBudget } from "@/lib/send-safety";
import { wrongPersonText } from "@/lib/tone-mixer";
import { composePreviewMail, formatFrom, getTransporter, isSenderAvailable, type SenderId } from "@/lib/senders";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { sender: "lucas"|"charlie", subject, body } — sender ét færdigt gratis udkast.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return hqWrite(req, async (actor) => {
    const { id } = await ctx.params;
    if (!/^preview_[a-z0-9_]{4,40}$/.test(id)) throw new HqInputError("ugyldigt id");
    const b = await jsonBody(req);
    // Afstemning efter usikkert forsøg: { reconcile: "sent" | "not-sent" } — sender aldrig noget.
    if (b.reconcile === "sent" || b.reconcile === "not-sent") {
      try {
        await reconcilePreview(getDb(), id, b.reconcile, async (pid) => {
          await updatePreviewStatus(pid, "sendt/lukket");
        });
      } catch (err) {
        if (err instanceof PreviewSendError) throw new HqInputError(err.message);
        throw err;
      }
      return { ok: true, reconciled: b.reconcile };
    }
    const sender = b.sender === "lucas" || b.sender === "charlie" ? (b.sender as SenderId) : null;
    if (!sender || !isSenderAvailable(sender)) throw new HqInputError("vælg en afsender der er forbundet");
    if (wrongPersonText(sender, String(b.body ?? ""))) throw new HqInputError("teksten nævner den anden person som afsender — ret den eller skift afsender");
    let seoTjek: SeoTjekResult | undefined;
    try {
      await sendPreview(getDb(), id, { subject: String(b.subject ?? ""), body: String(b.body ?? "") }, actor, {
        get: async (pid) => {
          const rec = (await readPreviewRequests()).find((r) => r.id === pid) ?? null;
          seoTjek = rec?.seoTjek;
          return rec;
        },
        deliver: async ({ to, subject, body }) => {
          // Frisk suppression lige før SMTP: modtageren kan have afmeldt sig/bouncet efter anmodningen.
          // Kold-pausen dækker ikke denne vej (svar på indgående anmodning). Sheets nede ⇒ intet sendt (Astra S2#2).
          const leads = await getLeads().catch(() => null);
          if (!leads) throw new PreviewSendError("kunne ikke tjekke afmeldinger — prøv igen om lidt");
          const key = to.trim().toLowerCase();
          if (addressSuppressed(leads, key)) throw new PreviewSendError("modtageren er afmeldt eller bounced — sendes ikke");
          const same = leads.filter((l) => (l.email || "").trim().toLowerCase() === key);
          // Historiske afmeldinger via svar står som status "skip" + emailStatus "replied" (før 9/10).
          if (same.some((l) => (l.status || "").trim().toLowerCase() === "skip")) {
            throw new PreviewSendError("leadet er markeret skip (fx afmeldt via svar) — tjek leadet i Sheets før afsendelse");
          }
          // Samme dagsbudget pr. konto som kold-køen (Sol bølge 2 F2). Kastes før SMTP ⇒ intet sendt.
          if (!(await takeDailyBudget(sender).catch(() => false))) throw new PreviewSendError(`dagligt loft nået (${DAILY_SEND_CAP}/dag fra ${sender}) — prøv i morgen`);
          await getTransporter(sender).sendMail({
            from: formatFrom(sender),
            to,
            subject,
            // SEO-tjek-henvendelse ⇒ den designede rapport-mail (samme som forhåndsvisningen).
            ...composePreviewMail(body, sender, seoTjek),
          });
        },
        markSent: async (pid, body) => {
          await updatePreviewStatus(pid, "sendt/lukket", { mailDraft: body });
        },
      });
    } catch (err) {
      if (err instanceof PreviewSendError) throw new HqInputError(err.message);
      throw err;
    }
    return { ok: true };
  });
}

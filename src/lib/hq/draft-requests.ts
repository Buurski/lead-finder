// Svar der siger ja til et gratis udkast bliver selv til en udkast-opgave
// (preview-køen som Hermes bygger fra). Før fangede kun kinly.dk-formularen det;
// et "ja tak, send gerne et udkast" som svar på en opfølgning gik tabt.
// Jev dømmer kun hvis JEV_REPLIES=1 (DPA-gaten for svartekst) — ellers regex.
import { jevAsk, noul } from "../jev.ts";

export interface DigestItemLike {
  leadId?: string;
  category?: string;
  snippet?: string;
  date?: string;
}

const WANTS = /\b(udkast|forslag|eksempel|ja tak|ja gerne|gerne se|lyder (godt|spændende|interessant)|send (det|gerne|mig)|vil (gerne|godt) se)\b/i;
const NO = /\b(nej tak|ikke interesseret|afmeld|stop|har allerede|ingen interesse)\b/i;

/** Deterministisk dom: positivt svar der nævner udkast/ja tak, uden et nej i. */
export function wantsDraftRegex(text: string): boolean {
  return WANTS.test(text) && !NO.test(text);
}

async function wantsDraft(text: string): Promise<boolean> {
  if (process.env.JEV_REPLIES === "1") {
    const r = await jevAsk(
      { svar: text.slice(0, 1500) },
      {
        vil: {
          type: "noul",
          instructions:
            "Svaret er fra en lokal virksomhed vi har tilbudt et gratis hjemmeside-udkast. Siger de ja til at få udkastet (eller beder om at se et forslag)?",
        },
      },
      { timeoutMs: 8000 },
    );
    const p = noul(r?.answers, "vil");
    if (p !== undefined) return p >= 0.6;
  }
  return wantsDraftRegex(text);
}

function key(i: DigestItemLike): string {
  return `${i.leadId}|${i.date ?? ""}|${(i.snippet ?? "").slice(0, 40)}`;
}

/** Opretter udkast-opgaver for svar der vil have et udkast. Returnerer antal nye. */
export async function applyDraftRequests(items: DigestItemLike[]): Promise<number> {
  const { store } = await import("../store.ts");
  const DONE = "draft-requests/processed";
  const done = new Set((await store.get<string[]>(DONE)) ?? []);
  const fresh = items.filter((i) => i.leadId && /^\d+$/.test(i.leadId) && i.snippet && !done.has(key(i)));
  if (!fresh.length) return 0;

  const { getLeads } = await import("../sheets.ts");
  const { createPreviewRequest, readPreviewRequests } = await import("../preview-queue.ts");
  const leads = new Map((await getLeads()).map((l) => [l.id, l]));
  const existing = new Set(
    (await readPreviewRequests()).filter((r) => r.status !== "afvist").map((r) => r.email.trim().toLowerCase()),
  );
  let created = 0;
  for (const i of fresh) {
    done.add(key(i));
    if (i.category === "not-interested" || i.category === "unsubscribe") continue;
    const lead = leads.get(i.leadId!);
    const email = (lead?.email ?? "").trim().toLowerCase();
    if (!lead || !email || existing.has(email)) continue;
    if (!(await wantsDraft(i.snippet!))) continue;
    const request = await createPreviewRequest({
      company: lead.name,
      channel: "mail",
      email: lead.email!,
      website: lead.website || undefined,
      branch: lead.branch || undefined,
      questionnaire: `Svarede på mail: "${i.snippet!.replace(/\s+/g, " ").trim().slice(0, 300)}"`,
    });
    existing.add(email);
    created++;
    const { attachProfile } = await import("./draft-profile.ts");
    await attachProfile(request.id, request);
    const { getDb, pgEnabled } = await import("../db/client.ts");
    if (pgEnabled()) {
      const { recordInbound } = await import("./inbound.ts");
      await recordInbound(getDb(), request).catch((err) =>
        console.error(JSON.stringify({ evt: "draft-request.crm_failed", error: String(err).slice(0, 200) })),
      );
    }
  }
  await store.put(DONE, [...done].slice(-2000));
  return created;
}

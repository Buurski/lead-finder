// Opfølgnings-sekvenser (spec §11). Første mail = trin 1 (motoren/leadgen).
// Denne fil laver trin 2..N som NYE kladder i godkendelseskøen — den sender
// aldrig selv. Hver opfølgning har sin egen vinkel, og en vinkel bruges aldrig
// to gange til samme virksomhed. Ethvert svar stopper sekvensen.
import "server-only";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, outreach } from "../db/schema.ts";
import { validateDraft } from "../draft.ts";
import { missingReferenceLinks, referenceLines, REFERENCE_INTRO } from "../demos.ts";
import type { QueueDraft } from "../queue.ts";

export const DEFAULT_TOUCHES = 3;
export const MAX_TOUCHES = 5;
/** Dage efter forrige mail før trin N er modent (index = trin). */
export const GAP_DAYS: Record<number, number> = { 2: 5, 3: 7, 4: 10, 5: 14 };

export type Angle = "gratis_udkast" | "seo_tjek" | "eksempel" | "sidste";
export const ANGLE_LABEL: Record<Angle, string> = {
  gratis_udkast: "Gratis udkast",
  seo_tjek: "Gratis SEO-tjek",
  eksempel: "Eksempel på en side",
  sidste: "Sidste mail",
};

// Livsfaser/status hvor vi aldrig følger op.
const DONE_LIFECYCLE = ["tabt", "ikke_egnet", "kunde", "flettet"];
const DONE_EMAIL_STATUS = new Set(["replied", "bounced", "unsubscribed", "unsubscribe"]);
const OPEN = ["pending", "edited", "approved"];

/** Vælg vinkel til næste trin: sidste trin er altid "sidste"; ellers første ubrugte der passer. */
export function nextAngle(step: number, maxTouches: number, used: string[], hasWebsite: boolean): Angle {
  if (step >= maxTouches) return "sidste";
  const order: Angle[] = hasWebsite ? ["gratis_udkast", "seo_tjek", "eksempel"] : ["gratis_udkast", "eksempel"];
  return order.find((a) => !used.includes(a)) ?? "sidste";
}

export interface SequenceLead {
  name: string;
  branch: string;
  website: string;
}

/** Kort opfølgning med én ny vinkel. Kaster hvis teksten bryder stemme-reglerne. */
export function composeStep(lead: SequenceLead, angle: Angle): { subject: string; body: string } {
  const n = lead.name.trim();
  let body: string;
  switch (angle) {
    case "gratis_udkast":
      body = [
        `Hej ${n},`,
        `Jeg skrev til jer for nylig om en ny hjemmeside. Det er let at drukne i mails, så jeg tager den lige igen.`,
        `Mit tilbud står stadig: Jeg laver gerne et gratis udkast til en forside for ${n}, så I kan se idéen helt konkret, før I beslutter noget.`,
        `Skal jeg gå i gang med det?`,
      ].join("\n\n");
      break;
    case "seo_tjek":
      body = [
        `Hej ${n},`,
        `En anden vinkel: Mange finder jer via Google, før de ringer eller booker. Jeg kører gerne et gratis tjek af, hvordan jeres side klarer sig dér, og sender jer de tre ting, der vil gøre størst forskel.`,
        `Det tager ingenting fra jer. I får bare en kort liste på mail.`,
        `Vil I have den?`,
      ].join("\n\n");
      break;
    case "eksempel":
      // Selve linket kommer fra den fælles link-blok nedenfor — ikke et
      // håndskrevet demo-link her, som førhen kunne pege på noget andet end
      // casen (og helt mangle på de øvrige vinkler).
      body = [
        `Hej ${n},`,
        `Hvis det er nemmere at se end at læse om, kan I se nogle af de sider jeg har bygget her.`,
        `De er lavet ud fra kundernes egne farver og billeder. Jeg kan lave noget tilsvarende til ${n}.`,
        `Skal jeg sende et udkast?`,
      ].join("\n\n");
      break;
    case "sidste":
      body = [
        `Hej ${n},`,
        `Det her er sidste gang, jeg skriver om det, så jeg ikke fylder jeres indbakke op.`,
        `Hvis en ny hjemmeside bliver aktuel senere, er I meget velkomne til at skrive. Så laver jeg gerne et gratis udkast til jer.`,
        `Rigtig god dag derude.`,
      ].join("\n\n");
      break;
  }
  // Link-politik (Lucas 24/9): HVERT trin og hver vinkel bærer kinly.dk-forsiden
  // plus den matchende case (eller bedste demo) og branche-siden. Linkene lægges
  // som eget afsnit før det afsluttende spørgsmål, så trin 2..N ikke længere kan
  // gå ud uden links. Ét sted at ændre politikken: demos.ts.
  const links = referenceLines(lead.branch, n);
  if (links.length) {
    const parts = body.split("\n\n");
    const last = parts.pop() ?? "";
    const block = [REFERENCE_INTRO, ...links].join("\n");
    body = (last ? [...parts, block, last] : [...parts, block]).join("\n\n");
  }

  const finalCheck = validateDraft(body);
  const checkLinks = missingReferenceLinks(body, lead.branch, n);
  if (!finalCheck.ok || checkLinks.length) {
    throw new Error(`opfølgning (${angle}) bryder stemme-reglerne: ${[...finalCheck.errors, ...checkLinks].join("; ")}`);
  }
  return { subject: `Re: En lille hilsen til ${n}`, body };
}

export interface FollowUpCandidate {
  companyId: string;
  rowNo: number;
  name: string;
  step: number; // trinnet der skal laves nu
  maxTouches: number;
  angle: Angle;
  lastSentAt: string;
  sender: string | null;
  email: string;
}

function daysBetween(fromIso: string, today: string): number {
  return Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(fromIso)) / 86_400_000);
}

/** Virksomheder hvor næste opfølgning er moden i dag. */
export async function followUpCandidates(db: Db, today: string): Promise<FollowUpCandidate[]> {
  const drafts = await db
    .select({ rowNo: outreach.companyRowNo, status: outreach.status, step: outreach.step, angle: outreach.angle, updatedAt: outreach.updatedAt, sender: outreach.sender, sentBy: outreach.sentBy })
    .from(outreach)
    .where(gt(outreach.companyRowNo, 0));
  const byRow = new Map<number, typeof drafts>();
  for (const d of drafts) byRow.set(d.rowNo!, [...(byRow.get(d.rowNo!) ?? []), d]);

  const rows = [...byRow.keys()];
  if (!rows.length) return [];
  const companies = await db.select().from(company).where(and(inArray(company.rowNo, rows), eq(company.archived, false)));

  const out: FollowUpCandidate[] = [];
  for (const c of companies) {
    if (DONE_LIFECYCLE.includes(c.lifecycle) || DONE_EMAIL_STATUS.has(c.emailStatus.trim().toLowerCase())) continue;
    if (c.leadStatus === "not-interested" || c.leadStatus === "skip" || c.leadStatus === "client") continue;
    const ds = byRow.get(c.rowNo) ?? [];
    if (ds.some((d) => OPEN.includes(d.status))) continue; // en kladde venter allerede
    const sent = ds.filter((d) => d.status === "sent");
    if (!sent.length) continue;
    const maxTouches = Math.min(c.maxTouches ?? DEFAULT_TOUCHES, MAX_TOUCHES);
    const step = sent.length + 1;
    if (step > maxTouches) continue;
    const last = sent.map((d) => d.updatedAt).sort().at(-1)!;
    if (!last || daysBetween(last, today) < GAP_DAYS[step]) continue;
    const used = ds.map((d) => d.angle).filter((a): a is string => Boolean(a));
    const lastSent = sent.find((d) => d.updatedAt === last)!;
    out.push({
      companyId: c.id,
      rowNo: c.rowNo,
      name: c.name,
      step,
      maxTouches,
      angle: nextAngle(step, maxTouches, used, Boolean(c.website)),
      lastSentAt: last,
      sender: lastSent.sentBy ?? lastSent.sender,
      email: c.email,
    });
  }
  return out.sort((a, b) => a.lastSentAt.localeCompare(b.lastSentAt));
}

/** QueueDraft for et opfølgnings-trin (samme afsender som sidst, så tråden hænger sammen). */
export function followUpDraft(c: FollowUpCandidate, lead: SequenceLead & { city: string }, now: string, id: string): QueueDraft {
  const { subject, body } = composeStep(lead, c.angle);
  return {
    id,
    leadId: String(c.rowNo),
    name: c.name,
    branch: lead.branch,
    city: lead.city,
    hooks: [],
    demoPair: [],
    professionalism: `Opfølgning ${c.step}/${c.maxTouches} · ${ANGLE_LABEL[c.angle]}`,
    subject,
    body,
    recipientEmail: c.email || undefined,
    website: lead.website || undefined,
    status: "pending",
    source: "opfoelgning",
    createdAt: now,
    updatedAt: now,
    sender: c.sender === "charlie" ? "charlie" : c.sender === "lucas" ? "lucas" : undefined,
    step: c.step,
    angle: c.angle,
  };
}

/** Stop alle åbne kladder til en virksomhed (fx fordi de har svaret). Returnerer antal. */
export function stopOpenDrafts(queue: QueueDraft[], leadId: string, reason: string, now: string): number {
  let n = 0;
  for (const d of queue) {
    if (d.leadId === leadId && OPEN.includes(d.status)) {
      d.status = "rejected";
      d.stoppedReason = reason;
      d.updatedAt = now;
      n++;
    }
  }
  return n;
}

/** Log i tidslinjen at en opfølgning er lagt klar. */
export async function logFollowUpCreated(db: Db, c: FollowUpCandidate): Promise<void> {
  await db.insert(activity).values({
    companyId: c.companyId,
    actor: "system",
    type: "opfoelgning",
    summary: `Opfølgning ${c.step}/${c.maxTouches} lagt til godkendelse (${ANGLE_LABEL[c.angle]})`,
  });
}

// ---- Koblinger til køen og svar ----

/** Stop åbne kladder for leads der har svaret (kaldes af sync-replies). */
export async function stopDraftsForReplies(rowIndexes: number[], reason = "svar modtaget"): Promise<number> {
  if (!rowIndexes.length) return 0;
  const { pgEnabled } = await import("../db/client.ts");
  if (pgEnabled()) {
    const { stopOpenForRows } = await import("../pg/queue.ts");
    return stopOpenForRows(rowIndexes.map((r) => r + 2), reason, new Date().toISOString());
  }
  const { readQueue, writeQueue } = await import("../queue.ts");
  const queue = await readQueue();
  const now = new Date().toISOString();
  let n = 0;
  for (const r of rowIndexes) n += stopOpenDrafts(queue, String(r + 2), reason, now);
  if (n) await writeQueue(queue);
  return n;
}

function itemKey(i: { leadId?: string; date?: string; snippet?: string }): string {
  return `${i.leadId}|${i.date ?? ""}|${(i.snippet ?? "").slice(0, 40)}`;
}

/** Et "nej tak"/afmelding i et svar: markér leadet, stop alt og log det. Rækken beholdes som spærre. */
export async function applyNoThanks(
  items: Array<{ id?: string; leadId?: string; category?: string; snippet?: string; date?: string }>,
): Promise<number> {
  const { classifyReply } = await import("../reply.ts");
  const { getLeads, updateLeadStatus } = await import("../sheets.ts");
  const { store } = await import("../store.ts");
  // Hvert svar behandles én gang: digesten ligger i dagevis og køres dagligt, og en
  // manuel rettelse (fx tilbage til "interesseret") må ikke blive overskrevet igen.
  const DONE_KEY = "no-thanks/processed";
  const done = new Set((await store.get<string[]>(DONE_KEY)) ?? []);
  const fresh = items.filter((i) => i.leadId && /^\d+$/.test(i.leadId) && Number(i.leadId) >= 2 && !done.has(itemKey(i)));
  if (!fresh.length) return 0;
  const leads = new Map((await getLeads()).map((l) => [l.id, l]));
  const rows: number[] = [];
  for (const i of fresh) {
    done.add(itemKey(i));
    const regex = i.snippet ? classifyReply(i.snippet).category : "other";
    if (i.category !== "not-interested" && regex !== "not-interested" && regex !== "unsubscribe") continue;
    const lead = leads.get(i.leadId!);
    if (!lead) continue;
    // Sekvensen stopper ALTID ved et nej (Sol 23/9) — men status røres kun hvis ingen
    // har vurderet leadet (interesseret/kunde er en menneskelig beslutning).
    if (!["not-interested", "client", "interested"].includes(lead.status)) {
      const line = `Svarede nej tak ${(i.date ?? new Date().toISOString()).slice(0, 10)}`;
      await updateLeadStatus(Number(i.leadId) - 2, "not-interested", lead.notes ? `${lead.notes}\n${line}` : line);
    }
    rows.push(Number(i.leadId) - 2);
  }
  await store.put(DONE_KEY, [...done].slice(-2000));
  await stopDraftsForReplies(rows, "svarede nej tak");
  return rows.length;
}

export const FOLLOWUPS_PER_DAY = 20;

/** Lav dagens modne opfølgninger som kladder (sender aldrig). */
export async function createFollowUpDrafts(db: Db, today: string, cap = FOLLOWUPS_PER_DAY): Promise<{ created: number; candidates: number }> {
  const { appendDrafts, newDraftId } = await import("../queue.ts");
  const candidates = (await followUpCandidates(db, today)).slice(0, cap);
  if (!candidates.length) return { created: 0, candidates: 0 };
  const rows = await db.select().from(company).where(inArray(company.id, candidates.map((c) => c.companyId)));
  const byId = new Map(rows.map((r) => [r.id, r]));
  const now = new Date().toISOString();
  const drafts: QueueDraft[] = [];
  for (const c of candidates) {
    const r = byId.get(c.companyId)!;
    try {
      drafts.push(followUpDraft(c, { name: r.name, branch: r.branch, website: r.website, city: r.city }, now, newDraftId()));
    } catch (err) {
      console.error(JSON.stringify({ evt: "followup.compose_failed", company: c.name, error: String(err).slice(0, 200) }));
    }
  }
  // appendDrafts returnerer hele den flettede kø — de nye er dem hvis id overlevede dedup.
  const kept = new Set((await appendDrafts(drafts)).map((d) => d.id));
  const added = drafts.filter((d) => kept.has(d.id));
  const addedRows = new Set(added.map((d) => d.leadId));
  for (const c of candidates) if (addedRows.has(String(c.rowNo))) await logFollowUpCreated(db, c);
  return { created: added.length, candidates: candidates.length };
}

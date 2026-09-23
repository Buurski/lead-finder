// "Hvad kræver min opmærksomhed nu?" — samler tværs af systemet i én liste til
// klokken + HQ-forsiden. Ren sammenstilling oven på eksisterende kilder
// (tasks.ts/summary.ts's definitioner, overview.ts's kundeattention) — ingen
// ny forretningslogik, ingen skrivning.
import "server-only";
import { and, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company, invoice, outreach } from "../db/schema.ts";
import { isOverdue, type InvoiceStatus } from "../invoices.ts";
import { readPreviewRequests } from "../preview-queue.ts";
import { listMyDay, type Owner } from "./tasks.ts";
import { getDossier } from "./dossier.ts";
import { loadOverview } from "./overview-load.ts";

export type AttentionLevel = "haster" | "obs";

export interface AttentionItem {
  level: AttentionLevel;
  kind: "opgave" | "svar" | "kladde" | "preview" | "faktura" | "kunde";
  text: string;
  href: string;
  companyId?: string;
  at?: string;
}

const MAX_ITEMS = 30;

// Samme statuslister som hq/summary.ts's getHqSummary — den fil må ikke
// redigeres herfra, så definitionen holdes i sync manuelt (ponytail: hvis de
// driver fra hinanden, ret begge steder).
const OPEN_DRAFT = ["pending", "edited"];

function daysSince(dateISO: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(dateISO)) / 86_400_000));
}

export async function getAttention(
  db: Db,
  opts: { owner?: Owner | null; today: string; now?: number },
): Promise<AttentionItem[]> {
  const now = opts.now ?? Date.now();
  const items: AttentionItem[] = [];

  // 1) Forfaldne + dagens opgaver/næste skridt for ejeren (samme kilde som /opgaver).
  const myDay = await listMyDay(db, { owner: opts.owner ?? undefined, today: opts.today });
  for (const it of myDay) {
    if (it.bucket !== "forfalden" && it.bucket !== "i_dag") continue;
    const text = it.kind === "deal" ? `${it.context}: ${it.title}${it.company ? ` · ${it.company}` : ""}` : `${it.title}${it.company ? ` · ${it.company}` : ""}`;
    items.push({
      level: it.bucket === "forfalden" ? "haster" : "obs",
      kind: "opgave",
      text,
      href: it.companyId ? `/virksomheder/${it.companyId}` : "/opgaver",
      companyId: it.companyId ?? undefined,
      at: it.due || undefined,
    });
  }

  // 2) Nye svar der ikke er behandlet — samme filter som HQ-kpi'en (summary.ts's
  // "replies": leadRows + emailStatus=replied + leadStatus new/called). Én
  // samlet linje ligesom kladder/previews nedenfor — kan sagtens være 50-100+
  // leads i praksis, så hver skal ikke stjæle en plads i de ~30 punkter.
  const leadRows = and(gt(company.rowNo, 0), eq(company.archived, false));
  const n = sql<number>`count(*)::int`;
  const [{ n: repliesN }] = await db
    .select({ n })
    .from(company)
    .where(and(leadRows, eq(company.emailStatus, "replied"), inArray(company.leadStatus, ["new", "called"])));
  if (repliesN > 0) {
    items.push({ level: "haster", kind: "svar", text: `${repliesN} svar venter — ikke behandlet`, href: "/replies" });
  }

  // 3) Kunder: genbrug kundeoverblikkets egen "haster"-linjer (site nede, kunden
  // venter, forfaldent, intet svar i X dage). Kun rigtige kunder (client_no sat),
  // få rækker — sekventielt, lokal pglite tåler kun 1 forbindelse.
  const customers = await db
    .select({ id: company.id })
    .from(company)
    .where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false), eq(company.archived, false)));
  for (const c of customers) {
    const dossier = await getDossier(db, c.id, { today: opts.today });
    if (!dossier) continue;
    const overview = await loadOverview(db, dossier, now);
    for (const a of overview.attention) {
      if (a.level !== "haster") continue;
      items.push({ level: "haster", kind: "kunde", text: `${dossier.company.name}: ${a.text}`, href: `/virksomheder/${c.id}`, companyId: c.id });
    }
  }

  // 4) Fakturaer — forfaldne (per faktura) + kladder ældre end 3 dage (samlet linje).
  const unpaid = await db
    .select({ number: invoice.number, companyId: invoice.companyId, clientName: invoice.clientName, status: invoice.status, dueDate: invoice.dueDate })
    .from(invoice)
    .where(inArray(invoice.status, ["sendt", "forfalden", "rykket"]));
  for (const inv of unpaid) {
    if (!isOverdue({ status: inv.status as InvoiceStatus, dueDate: inv.dueDate }, opts.today)) continue;
    items.push({
      level: "haster",
      kind: "faktura",
      text: `Faktura ${inv.number} er forfalden · ${inv.clientName}`,
      href: inv.companyId ? `/virksomheder/${inv.companyId}` : "/fakturaer",
      companyId: inv.companyId ?? undefined,
      at: inv.dueDate,
    });
  }
  const draftInvoices = await db
    .select({ issueDate: invoice.issueDate })
    .from(invoice)
    .where(eq(invoice.status, "kladde"));
  const staleDrafts = draftInvoices.filter((d) => daysSince(`${d.issueDate}T12:00:00Z`, now) >= 3);
  if (staleDrafts.length > 0) {
    items.push({ level: "obs", kind: "faktura", text: `${staleDrafts.length} ${staleDrafts.length === 1 ? "fakturakladde ligger" : "fakturakladder ligger"} klar — ikke sendt`, href: "/fakturaer" });
  }

  // 5) Kladder der venter på godkendelse — én linje, samme statusser som summary.ts.
  const pendingDrafts = await db.select({ id: outreach.id }).from(outreach).where(inArray(outreach.status, OPEN_DRAFT));
  if (pendingDrafts.length > 0) {
    items.push({ level: "obs", kind: "kladde", text: `${pendingDrafts.length} ${pendingDrafts.length === 1 ? "kladde venter" : "kladder venter"} på godkendelse`, href: "/approve" });
  }

  // 6) Gratis udkast klar men ikke sendt.
  const previews = await readPreviewRequests();
  const previewsReady = previews.filter((p) => p.status === "preview klar");
  if (previewsReady.length > 0) {
    items.push({ level: "obs", kind: "preview", text: `${previewsReady.length} ${previewsReady.length === 1 ? "gratis udkast er" : "gratis udkast er"} klar — ikke sendt`, href: "/previews" });
  }

  // Haster først, ellers indsættelsesrækkefølgen ovenfor (stabil sort).
  items.sort((a, b) => (a.level === b.level ? 0 : a.level === "haster" ? -1 : 1));
  return items.slice(0, MAX_ITEMS);
}

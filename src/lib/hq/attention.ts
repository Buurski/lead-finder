// "Hvad kræver min opmærksomhed nu?" — samler tværs af systemet i én liste til
// klokken + HQ-forsiden. Ren sammenstilling oven på eksisterende kilder
// (tasks.ts/summary.ts's definitioner, overview.ts's kundeattention) — ingen
// ny forretningslogik, ingen skrivning.
import "server-only";
import { cache } from "react";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company, invoice, outreach } from "../db/schema.ts";
import { isOverdue, type InvoiceStatus } from "../invoices.ts";
import { readPreviewRequests } from "../preview-queue.ts";
import { listMyDay, type Owner } from "./tasks.ts";
import { getDossiers } from "./dossier.ts";
import { unhandledReplyWhere } from "./summary.ts";
import { loadOverviews } from "./overview-load.ts";
import { markPaidAction, taskDoneAction, type AttentionAction } from "./overview.ts";
import { AUTO_FRIST_MS, denneMaaned, oversigt } from "./kunde-rapport.ts";

export type AttentionLevel = "haster" | "obs";

export interface AttentionItem {
  level: AttentionLevel;
  kind: "opgave" | "svar" | "kladde" | "preview" | "faktura" | "kunde" | "rapport";
  text: string;
  href: string;
  companyId?: string;
  at?: string;
  action?: AttentionAction;
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
      action: taskDoneAction(it.id),
    });
  }

  // 2) Nye svar der ikke er behandlet — samme filter som HQ-kpi'en (summary.ts's
  // "replies": leadRows + emailStatus=replied + leadStatus new/called). Én
  // samlet linje ligesom kladder/previews nedenfor — kan sagtens være 50-100+
  // leads i praksis, så hver skal ikke stjæle en plads i de ~30 punkter.
  const n = sql<number>`count(*)::int`;
  const [{ n: repliesN }] = await db
    .select({ n })
    .from(company)
    .where(unhandledReplyWhere());
  if (repliesN > 0) {
    items.push({ level: "haster", kind: "svar", text: `${repliesN} svar venter — ikke behandlet`, href: "/replies" });
  }

  // 3) Kunder: genbrug kundeoverblikkets egen "haster"-linjer (site nede, kunden
  // venter, forfaldent, intet svar i X dage). Kun rigtige kunder (client_no sat),
  // få rækker — sekventielt, lokal pglite tåler kun 1 forbindelse.
  const customers = await db
    .select()
    .from(company)
    .where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false), eq(company.archived, false)));
  // Batch: samme antal forespørgsler uanset antal kunder (før: N × ~10).
  const ordered = await getDossiers(db, customers, { today: opts.today });
  const overviews = await loadOverviews(db, ordered, now);
  ordered.forEach((dossier, i) => {
    for (const a of overviews[i].attention) {
      if (a.level !== "haster") continue;
      if (a.action?.url.startsWith("/api/opgaver/")) continue; // opgaver + næste skridt er allerede med fra punkt 1
      items.push({ level: "haster", kind: "kunde", text: `${dossier.company.name}: ${a.text}`, href: `/virksomheder/${dossier.company.id}`, companyId: dossier.company.id, action: a.action });
    }
  });

  // 4) Fakturaer — forfaldne (per faktura) + kladder ældre end 3 dage (samlet linje).
  const invRows = await db
    .select({ number: invoice.number, companyId: invoice.companyId, clientName: invoice.clientName, status: invoice.status, dueDate: invoice.dueDate, issueDate: invoice.issueDate })
    .from(invoice)
    .where(inArray(invoice.status, ["sendt", "forfalden", "rykket", "kladde"])); // ét kald for både ubetalte og kladder
  for (const inv of invRows) {
    if (inv.status === "kladde") continue;
    if (!isOverdue({ status: inv.status as InvoiceStatus, dueDate: inv.dueDate }, opts.today)) continue;
    items.push({
      level: "haster",
      kind: "faktura",
      text: `Faktura ${inv.number} er forfalden · ${inv.clientName}`,
      href: inv.companyId ? `/virksomheder/${inv.companyId}` : "/fakturaer",
      companyId: inv.companyId ?? undefined,
      at: inv.dueDate,
      action: markPaidAction(inv.number),
    });
  }
  const staleDrafts = invRows.filter((d) => d.status === "kladde" && daysSince(`${d.issueDate}T12:00:00Z`, now) >= 3);
  if (staleDrafts.length > 0) {
    items.push({ level: "obs", kind: "faktura", text: `${staleDrafts.length} ${staleDrafts.length === 1 ? "fakturakladde ligger" : "fakturakladder ligger"} klar — ikke sendt`, href: "/fakturaer" });
  }

  // 5) Kladder der venter på godkendelse — én linje, samme statusser som summary.ts.
  const pendingDrafts = await db.select({ id: outreach.id }).from(outreach).where(inArray(outreach.status, OPEN_DRAFT));
  if (pendingDrafts.length > 0) {
    items.push({ level: "obs", kind: "kladde", text: `${pendingDrafts.length} ${pendingDrafts.length === 1 ? "kladde venter" : "kladder venter"} på godkendelse`, href: "/approve" });
  }

  // 6) Gratis udkast klar men ikke sendt.
  // Kan køen ikke læses, vises det som en linje — resten af forsiden må ikke vælte (Sol R11-01).
  const previews = await readPreviewRequests().catch((err) => {
    console.error(JSON.stringify({ evt: "attention.previews_failed", error: String(err).slice(0, 200) }));
    items.push({ level: "haster", kind: "preview", text: "Kunne ikke læse gratis udkast-køen — tjek /previews", href: "/previews" });
    return [];
  });
  const previewsReady = previews.filter((p) => p.status === "preview klar");
  if (previewsReady.length > 0) {
    items.push({ level: "obs", kind: "preview", text: `${previewsReady.length} ${previewsReady.length === 1 ? "gratis udkast er" : "gratis udkast er"} klar — ikke sendt`, href: "/previews" });
  }

  // 7) Månedsrapporter: dem der sendes af sig selv inden for et døgn (så Lucas kan nå at
  // se dem), og klare rapporter automatikken ikke må sende. To samlede linjer.
  const rap = await oversigt(db, denneMaaned(new Date(now))).catch((err) => {
    console.error(JSON.stringify({ evt: "attention.rapporter_failed", error: String(err).slice(0, 200) }));
    return null;
  });
  if (rap) {
    const klar = rap.raekker.filter((r) => r.tilmeldt && r.status === "klar");
    const snart = klar.filter((r) => !r.auto.stop && r.auto.sendesEfter && Date.parse(r.auto.sendesEfter) - now < AUTO_FRIST_MS);
    const venter = klar.filter((r) => r.auto.stop);
    if (snart.length) {
      items.push({ level: "obs", kind: "rapport", text: `${snart.length === 1 ? `Månedsrapporten til ${snart[0].kunde} sendes` : `${snart.length} månedsrapporter sendes`} automatisk inden for et døgn. Se ${snart.length === 1 ? "den" : "dem"} igennem`, href: "/kunder/rapporter" });
    }
    if (venter.length) {
      items.push({ level: "haster", kind: "rapport", text: `${venter.length === 1 ? `Månedsrapporten til ${venter[0].kunde} venter` : `${venter.length} månedsrapporter venter`} på dig og sendes ikke af sig selv`, href: "/kunder/rapporter" });
    }
  }

  // Haster først, ellers indsættelsesrækkefølgen ovenfor (stabil sort).
  items.sort((a, b) => (a.level === b.level ? 0 : a.level === "haster" ? -1 : 1));
  // Samle-linjerne (svar/kladder/udkast) er én linje hver og må aldrig skæres væk af loftet (Sol 23/9).
  const isAgg = (i: AttentionItem) => i.kind === "svar" || i.kind === "kladde" || i.kind === "preview" || i.kind === "rapport";
  const keep = new Set([...items.filter(isAgg), ...items.filter((i) => !isAgg(i)).slice(0, MAX_ITEMS - items.filter(isAgg).length)]);
  return items.filter((i) => keep.has(i));
}

// Én beregning pr. request: side + server-komponenter der beder om samme (ejer, dag) deler
// resultatet. Klokken i browseren genbruger forsidens liste via components/shell/attention-seed.ts.
export const getAttentionShared = cache((db: Db, owner: Owner | null, today: string) => getAttention(db, { owner, today }));

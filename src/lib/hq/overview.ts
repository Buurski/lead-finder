// Kundeoverblik (Lucas 23/9): det væsentlige om en kunde på ét kort — hvem
// venter på hvem, hvad der haster, aftale og penge, seneste kontakt og arbejde,
// hvad vi leverer, og hvilke data der mangler. Ren beregning oven på dossieret,
// så den kan testes uden database og altid er opdateret når siden åbnes.
import type { Dossier } from "./dossier.ts";
import { normalizeStage } from "./deals.ts";
import { invoiceTotal, type Subscription } from "../invoices.ts";

export type MailDir = "ud" | "ind";

// Hermes' mail-resuméer er skrevet som "Svar sendt til Allan: …" / "Lene svarer på …".
const OUT =
  /^(svar sendt|sendt|mail sendt|påmindelse sendt|opfølgning sendt|tilbud sendt|faktura \d* ?sendt|vi (har )?(sendt|skrevet|svaret|spurgt)|(lucas|charlie) (sendte|skrev|svarede|bad|spurgte|fulgte op|mindede)|(lucas|charlie) modtog\b.*\bog (bad|spurgte|sendte|svarede|skrev))/i;
// "Lucas modtog svar fra X" alene er indgående; "modtog … og bad om …" slutter med os.

// Passiv form om os selv tidligt i resuméet: "Nyhedsbrevet spurgt ind til igen: …".
const OUT_PASSIVE = /^[^:.]{0,50}(spurgt ind til|fulgt op|rykket( for)?|mindet om|påmindet|sendt til)/i;

export function mailDirection(summary: string): MailDir {
  const t = summary.trim();
  return OUT.test(t) || OUT_PASSIVE.test(t) ? "ud" : "ind";
}

export interface Attention {
  level: "haster" | "obs";
  text: string;
}

export interface CustomerOverview {
  attention: Attention[];
  lastMails: Array<{ at: string; dir: MailDir; summary: string }>;
  lastWork: Array<{ at: string; type: string; actor: string; summary: string }>;
  money: {
    plan: { lines: Subscription["lines"]; perMonth: number; dayOfMonth: number; active: boolean } | null;
    unpaid: number;
    overdue: number;
    invoicedTotal: number;
    unbilled: number;
    openDraftInvoices: string[];
  };
  services: string[];
  site: { status: string; domain: string | null; cmsUrl: string | null; lastDeployAt: string | null; health: Record<string, unknown> | null } | null;
  missing: string[];
}

const WORK_TYPES = new Set(["arbejde", "note", "deploy", "kundeopdatering", "udkast_sendt", "faktura", "fase", "moede", "opkald"]);
const OPEN_DEAL = new Set(["aftalt", "i_gang"]);
const DAY = 86_400_000;

function daysSince(iso: string, now: number): number {
  return Math.max(0, Math.floor((now - Date.parse(iso)) / DAY));
}
const dage = (n: number) => (n === 1 ? "1 dag" : `${n} dage`);
const kr = (n: number) => `${n.toLocaleString("da-DK")} kr`;

// Fallback-domæne: virksomhedens website (Sheets-feltet) er ofte udfyldt
// længe før et site oprettes i src/lib/db/schema.ts's site-tabel — værtsnavnet
// derfra er bedre end at sige "mangler" når det reelt står i headeren.
function hostnameFrom(website: string | null | undefined): string | null {
  const w = (website ?? "").trim();
  if (!w) return null;
  try {
    return new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function buildOverview(
  d: Dossier,
  extra: { subscription: Subscription | null; unbilled: number; now: number },
): CustomerOverview {
  const { now } = extra;
  const acts = [...d.activities].sort((a, b) => b.at.getTime() - a.at.getTime());
  const mails = acts.filter((a) => a.type === "email").map((a) => ({ at: a.at.toISOString(), dir: mailDirection(a.summary), summary: a.summary }));
  const work = acts
    // Systemets egne noter/fase-skift (flet, data udfyldt) er ikke "arbejde for kunden".
    .filter((a) => WORK_TYPES.has(a.type) && !((a.type === "note" || a.type === "fase") && ["system", "claude", "codex"].includes(a.actor)))
    .map((a) => ({ at: a.at.toISOString(), type: a.type, actor: a.actor, summary: a.summary }));

  const invoices = d.invoices;
  const paid = invoices.filter((i) => i.status === "betalt");
  const invoicedTotal = invoices.filter((i) => i.status !== "kladde").reduce((s, i) => s + invoiceTotal(i).total, 0);
  const drafts = invoices.filter((i) => i.status === "kladde");
  const sub = extra.subscription;
  const plan = sub
    ? { lines: sub.lines, perMonth: sub.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0), dayOfMonth: sub.dayOfMonth, active: sub.active }
    : null;

  const attention: Attention[] = [];
  const last = mails[0];
  if (last) {
    const n = daysSince(last.at, now);
    if (last.dir === "ind" && n >= 1) attention.push({ level: "haster", text: `Kunden venter på svar fra os (${dage(n)})` });
  }
  const openDeals = d.deals.filter((x) => OPEN_DEAL.has(normalizeStage(x.stage)));
  if (d.balance.overdue > 0) attention.push({ level: "haster", text: `${kr(d.balance.overdue)} forfaldent` });
  if (last && last.dir === "ud" && openDeals.length) {
    const n = daysSince(last.at, now);
    if (n >= 7) {
      const betaltIkkeLeveret = paid.length > 0 ? " — har betalt, men leverancen er ikke færdig" : "";
      attention.push({ level: "haster", text: `Intet svar fra kunden i ${dage(n)}${betaltIkkeLeveret}` });
    }
  }
  for (const inv of drafts) {
    if (daysSince(`${inv.issueDate}T12:00:00Z`, now) >= 3) attention.push({ level: "obs", text: `Faktura ${inv.number} ligger som kladde` });
  }
  const health = d.site?.health as { ok?: boolean; downSince?: string | null; sslDaysLeft?: number | null } | null | undefined;
  if (health && health.ok === false) {
    const n = health.downSince ? daysSince(health.downSince, now) : 0;
    attention.push({ level: "haster", text: n >= 1 ? `Sitet har ikke svaret i ${dage(n)}` : "Sitet svarer ikke" });
  } else if (health && typeof health.sslDaysLeft === "number" && health.sslDaysLeft < 14) {
    attention.push({ level: "obs", text: `SSL-certifikatet udløber om ${dage(Math.max(0, health.sslDaysLeft))}` });
  }
  if (extra.unbilled > 0) attention.push({ level: "obs", text: `${kr(extra.unbilled)} arbejde er ikke faktureret` });
  for (const x of openDeals) {
    if (!x.nextStep?.trim()) attention.push({ level: "obs", text: `"${x.title || "Aftale"}" har intet næste skridt` });
  }

  const fallbackDomain = hostnameFrom(d.company.website);
  const isClient = d.company.clientNo !== null && !d.company.clientRemoved;
  const missing: string[] = [];
  if (isClient && !plan) missing.push("aftale/pris");
  if (!d.contacts.some((c) => c.email) && !d.company.email) missing.push("kontakt-mail");
  if (isClient && !d.site?.domain && !fallbackDomain) missing.push("domæne");
  if (isClient && !(d.company.services ?? []).length) missing.push("hvad vi leverer");
  if (isClient && !d.deals.length) missing.push("aftale i pipeline");

  return {
    attention,
    lastMails: mails.slice(0, 4),
    lastWork: work.slice(0, 5),
    money: {
      plan,
      unpaid: d.balance.unpaid,
      overdue: d.balance.overdue,
      invoicedTotal,
      unbilled: extra.unbilled,
      openDraftInvoices: drafts.map((i) => i.number),
    },
    services: d.company.services ?? [],
    site: d.site
      ? { status: d.site.status, domain: d.site.domain, cmsUrl: d.site.cmsUrl, lastDeployAt: d.site.lastDeployAt?.toISOString() ?? null, health: (d.site.health as Record<string, unknown> | null) ?? null }
      : null,
    missing,
  };
}

/** Hvad vi leverer — faste nøgler så de kan tælles og filtreres. */
export const SERVICES: Record<string, string> = {
  hjemmeside: "Hjemmeside",
  hosting: "Hosting",
  cms: "CMS",
  seo: "SEO",
  google_profil: "Google-profil",
  nyhedsbrev: "Nyhedsbrev",
  annoncer: "Annoncer",
  sociale_medier: "Sociale medier",
  analytics: "Analytics",
};

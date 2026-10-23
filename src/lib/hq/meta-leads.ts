// Meta-leads uden Meta-app (23/10, før K1): Lucas downloader CSV'en i Leads Center og
// importerer den i HQ med ét klik. Hver række bliver en henvendelse (virksomhed, kontakt,
// aktivitet med kilde = Meta + annoncenavn, opgave "Ring til Meta-lead"). Dubletter på
// lead-id, e-mail eller telefon springes over. Intet sendes — kun data.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity } from "../db/schema.ts";
import { recordInbound } from "./inbound.ts";
import { cleanLeadSource } from "./lead-source.ts";

export class MetaImportError extends Error {}

export const META_IMPORT_MAX_ROWS = 500;

/** RFC 4180-ish: anførselstegn, "" som escape, linjeskift i felter. Skilletegn gættes fra header-linjen. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const head = src.slice(0, src.search(/\r?\n/) >>> 0 || src.length);
  const delim = [",", "\t", ";"].map((d) => [d, head.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

// Meta sætter typepræfiks på værdier: "p:+4512345678", "l:123…", "ag:…", "c:…", "f:…".
const unprefix = (v: string) => v.trim().replace(/^(?:p|l|ag|as|c|f|ad):(?=\S)/, "");

const STANDARD: Record<string, string> = {
  id: "leadId", lead_id: "leadId", created_time: "createdTime",
  ad_id: "", ad_name: "adName", adset_id: "", adset_name: "adsetName", campaign_id: "", campaign_name: "campaignName",
  form_id: "", form_name: "formName", is_organic: "", platform: "", lead_status: "",
  full_name: "name", "fulde navn": "name", navn: "name", name: "name",
  email: "email", "e-mail": "email",
  phone_number: "phone", phone: "phone", telefon: "phone", telefonnummer: "phone",
  company_name: "company", firmanavn: "company", "virksomhedens navn": "company",
};

export interface MetaLeadRow {
  line: number;
  leadId: string;
  createdTime: string;
  adName: string;
  adsetName: string;
  campaignName: string;
  formName: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  website: string;
  answers: string[];
  test: boolean;
}

export function metaRows(text: string): MetaLeadRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new MetaImportError("filen har ingen leads (kun overskrifter eller tom)");
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (!header.some((h) => STANDARD[h] === "email") && !header.some((h) => STANDARD[h] === "phone")) {
    throw new MetaImportError("det ligner ikke en Leads Center-fil: der er hverken en e-mail- eller telefon-kolonne");
  }
  if (rows.length - 1 > META_IMPORT_MAX_ROWS) throw new MetaImportError(`højst ${META_IMPORT_MAX_ROWS} leads pr. import`);
  return rows.slice(1).map((cells, i) => {
    const r: MetaLeadRow = { line: i + 2, leadId: "", createdTime: "", adName: "", adsetName: "", campaignName: "", formName: "", name: "", email: "", phone: "", company: "", website: "", answers: [], test: false };
    header.forEach((h, j) => {
      const v = unprefix(cells[j] ?? "").slice(0, 500);
      if (!v) return;
      if (/test lead|dummy data/i.test(v)) r.test = true;
      const key = STANDARD[h];
      if (key === "") return;
      if (key) (r as unknown as Record<string, string>)[key] = v;
      else if (/hjemmeside|website/.test(h)) r.website = v;
      else r.answers.push(`${rows[0][j].trim().replace(/_/g, " ")}: ${v}`);
    });
    if (/^ingen$/i.test(r.website)) { r.answers.push("Hjemmeside i dag: ingen"); r.website = ""; }
    r.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email) ? r.email.toLowerCase() : "";
    return r;
  });
}

const last8 = (phone: string) => phone.replace(/\D/g, "").slice(-8);

async function knownLead(db: Db, email: string, phone: string): Promise<boolean> {
  const p8 = last8(phone);
  const byEmail = email ? sql`lower(${activity.payload}->>'email') = ${email}` : sql`false`;
  const byPhone = p8.length === 8 ? sql`right(regexp_replace(coalesce(${activity.payload}->>'phone', ''), '\\D', '', 'g'), 8) = ${p8}` : sql`false`;
  const [hit] = await db.select({ id: activity.id }).from(activity).where(and(eq(activity.type, "henvendelse"), sql`(${byEmail} or ${byPhone})`)).limit(1);
  return Boolean(hit);
}

export interface MetaImportResult {
  created: { line: number; name: string; companyId: string; rowNo: number }[];
  duplicates: { line: number; name: string; reason: string }[];
  skipped: { line: number; reason: string }[];
}

/** Importerer leads. Kalderen stopper kolde kladder for rækkenumrene i `created` (som linkPreview). */
export async function importMetaLeads(db: Db, text: string): Promise<MetaImportResult> {
  const out: MetaImportResult = { created: [], duplicates: [], skipped: [] };
  const seen = new Set<string>();
  for (const r of metaRows(text)) {
    const who = r.name || r.company || r.email || r.phone;
    if (!r.email && last8(r.phone).length < 8) { out.skipped.push({ line: r.line, reason: "mangler både e-mail og telefon" }); continue; }
    const keys = [r.email && `e:${r.email}`, last8(r.phone).length === 8 && `p:${last8(r.phone)}`].filter(Boolean) as string[];
    if (keys.some((k) => seen.has(k))) { out.duplicates.push({ line: r.line, name: who, reason: "samme e-mail/telefon længere oppe i filen" }); continue; }
    keys.forEach((k) => seen.add(k));
    if (await knownLead(db, r.email, r.phone)) { out.duplicates.push({ line: r.line, name: who, reason: "findes allerede som henvendelse (e-mail/telefon)" }); continue; }
    const source = cleanLeadSource({ meta: { leadId: r.leadId, adName: r.adName, adsetName: r.adsetName, campaignName: r.campaignName, formName: r.formName, createdTime: r.createdTime } });
    const res = await recordInbound(db, {
      id: `meta-${r.leadId || `${r.email || last8(r.phone)}-${r.createdTime}`}`,
      company: r.company || r.name || r.email,
      email: r.email,
      phone: r.phone,
      contactName: r.name,
      website: r.website || undefined,
      channel: "meta-formular",
      questionnaire: [r.test ? "TEST-lead fra Metas testværktøj" : "", ...r.answers].filter(Boolean).join("\n"),
      source,
    });
    if (res.duplicate) out.duplicates.push({ line: r.line, name: who, reason: "lead-id er allerede importeret" });
    else out.created.push({ line: r.line, name: who, companyId: res.companyId, rowNo: res.rowNo });
  }
  return out;
}

import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, task } from "../db/schema.ts";
import { recordInbound } from "./inbound.ts";
import { importMetaLeads, metaRows, parseCsv, MetaImportError } from "./meta-leads.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

// Opdigtede testdata i Leads Center-format (præfikser som Meta: l:, p:, ag:).
const HEADER = "id,created_time,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,form_name,is_organic,platform,har_jeres_virksomhed_et_cvr-nummer?,jeres_hjemmeside_i_dag,hvornår_skal_i_bruge_en_ny_side?,full_name,phone_number,email,company_name";
const row = (id: string, name: string, phone: string, email: string, firm: string, site = "ingen") =>
  `l:${id},2026-10-23T09:15:00+0200,ag:1,K1-A-gpt1,as:2,KIN-K1-as1,c:3,KIN-K1-leads-2610,f:4,KIN-demo-v1,false,fb,Ja,${site},Inden for en måned,${name},p:${phone},${email},${firm}`;

test("parseCsv: anførselstegn, komma i felt, linjeskift i felt, tab-separeret og BOM", () => {
  assert.deepEqual(parseCsv('a,b\n"x, y","linje 1\nlinje 2"\n'), [["a", "b"], ["x, y", "linje 1\nlinje 2"]]);
  assert.deepEqual(parseCsv("﻿a\tb\r\n1\t\"2 \"\"citat\"\"\"\r\n"), [["a", "b"], ["1", '2 "citat"']]);
});

test("metaRows: præfikser fjernes, standardfelter mappes, spørgsmål bliver svar-linjer", () => {
  const [r] = metaRows([HEADER, row("111", "Test Testesen", "+4511223344", "TEST@Eksempel.dk", "Testfirma ApS", "testfirma.dk")].join("\n"));
  assert.equal(r.leadId, "111");
  assert.equal(r.phone, "+4511223344");
  assert.equal(r.email, "test@eksempel.dk");
  assert.equal(r.adName, "K1-A-gpt1");
  assert.equal(r.website, "testfirma.dk");
  assert.ok(r.answers.includes("hvornår skal i bruge en ny side?: Inden for en måned"));
  assert.throws(() => metaRows("navn,by\nA,B"), MetaImportError);
  assert.throws(() => metaRows(HEADER), /ingen leads/);
});

test("import: opretter henvendelse med Meta-kilde + annoncenavn og en ring-opgave; intet sendes", async () => {
  const csv = [HEADER, row("111", "Test Testesen", "+4511223344", "test@eksempel.dk", "Testfirma ApS")].join("\n");
  const r = await importMetaLeads(db, csv);
  assert.equal(r.created.length, 1);
  const [c] = await db.select().from(company).where(eq(company.id, r.created[0].companyId));
  assert.equal(c.name, "Testfirma ApS");
  assert.equal(c.source, "meta");
  assert.equal(c.phone, "+4511223344");
  const [a] = await db.select().from(activity);
  assert.match(a.summary, /^Henvendelse via Meta-annonce \(meta-formular\) · kilde: Meta-formular · K1-A-gpt1/);
  assert.match(a.summary, /Hjemmeside i dag: ingen/);
  assert.deepEqual((a.payload as { source: unknown }).source, {
    meta: { leadId: "111", adName: "K1-A-gpt1", adsetName: "KIN-K1-as1", campaignName: "KIN-K1-leads-2610", formName: "KIN-demo-v1", createdTime: "2026-10-23T09:15:00+0200" },
  });
  const [t] = await db.select().from(task);
  assert.equal(t.title, "Ring til Meta-lead (K1-A-gpt1)");
});

test("import: dubletter på lead-id, e-mail, telefon og i samme fil springes over", async () => {
  await recordInbound(db, { id: "web1", company: "Webfirma", email: "kendt@eksempel.dk", channel: "formular" });
  await recordInbound(db, { id: "web2", company: "Ringefirma", email: "andet@eksempel.dk", phone: "+45 22 33 44 55", channel: "formular" });
  const csv = [
    HEADER,
    row("1", "A", "+4599887766", "kendt@eksempel.dk", "Firma A"),
    row("2", "B", "22334455", "ny-b@eksempel.dk", "Firma B"),
    row("3", "C", "+4512121212", "ny-c@eksempel.dk", "Firma C"),
    row("4", "C igen", "+4512121212", "c2@eksempel.dk", "Firma C2"),
    row("5", "Uden kontakt", "", "ikke-en-mail", "Firma D"),
  ].join("\n");
  const r = await importMetaLeads(db, csv);
  assert.deepEqual(r.created.map((x) => x.line), [4]);
  assert.deepEqual(r.duplicates.map((x) => x.line), [2, 3, 5]);
  assert.deepEqual(r.skipped.map((x) => x.line), [6]);
  // Samme fil igen: alt er dublet nu, intet nyt.
  const again = await importMetaLeads(db, csv);
  assert.equal(again.created.length, 0);
  assert.equal((await db.select().from(activity)).length, 3);
});

test("import: Metas testlead markeres TEST", async () => {
  const csv = [HEADER, row("9", "<test lead: dummy data for full_name>", "+4500000000", "test@fb.com", "<test lead: dummy data for company_name>")].join("\n");
  await importMetaLeads(db, csv);
  const [a] = await db.select().from(activity);
  assert.match(a.summary, /TEST-lead fra Metas testværktøj/);
});

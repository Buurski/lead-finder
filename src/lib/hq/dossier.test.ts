import { test } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import { activity, company, deal, invoice } from "../db/schema.ts";
import { dossierText, getDossier, noteMatches, pickNotes } from "./dossier.ts";

test("vault-noter matches på kundens navn", () => {
  assert.ok(noteMatches("VIDA Skønhedsklinik", "wiki/kunder/vida-klinik.md"));
  assert.ok(noteMatches("VIDA Skønhedsklinik", "wiki/kunder/kunde-info-vida.md"));
  assert.ok(noteMatches("KT VVS", "wiki/kunder/ktvvs.md"));
  assert.ok(noteMatches("Jernbanecaféen", "wiki/kunder/jernbanecafeen.md"));
  assert.ok(noteMatches("Ikast AutoService", "wiki/kunder/ikast-autoservice-gbp-plan.md"));
  assert.ok(!noteMatches("Salon Artec", "wiki/kunder/street-cut.md"));
  assert.ok(!noteMatches("Salon Vida Nord", "wiki/kunder/zappa.md"));
});

test("crm_id i frontmatter overtrumfer navne-match", () => {
  const notes = [
    { path: "wiki/kunder/vida-klinik.md", title: "Vida", body: "gammel" },
    { path: "wiki/kunder/anden.md", title: "Kanonisk", body: "ny", crmId: "abc" },
  ];
  assert.deepEqual(pickNotes("abc", "VIDA", notes).map((n) => n.title), ["Kanonisk"]);
  assert.deepEqual(pickNotes("xyz", "VIDA", notes).map((n) => n.title), ["Vida"]);
});

test("dossier samler tal, tidslinje og viden — og tekstudgaven respekterer loftet", async () => {
  const db = await freshTestDb();
  const [vida] = await db.insert(company).values({ rowNo: -1, clientNo: 2, name: "VIDA Skønhedsklinik", lifecycle: "kunde" }).returning();
  await db.insert(deal).values({ companyId: vida.id, title: "Hjemmesidepas", stage: "live", monthlyFeeRaw: "750", isPrimary: true });
  await db.insert(activity).values({ companyId: vida.id, actor: "lucas", type: "note", summary: "Lene vil have nyt billede" });
  const data = { number: "009", clientName: "VIDA", recipient: { name: "VIDA" }, issueDate: "2026-09-01", dueDate: "2026-09-15", lines: [{ description: "Pas", amount: 750 }], vatRate: 0, status: "sendt", payerType: "cvr" };
  await db.insert(invoice).values({ number: "009", companyId: vida.id, clientName: "VIDA", status: "sendt", issueDate: data.issueDate, dueDate: data.dueDate, data });
  const d = await getDossier(db, vida.id, { today: "2026-09-22", notes: [{ path: "wiki/kunder/vida-klinik.md", title: "VIDA", body: "Lene foretrækker SMS." }] });
  assert.ok(d);
  assert.deepEqual(d.balance, { unpaid: 750, overdue: 750 });
  const text = dossierText(d);
  assert.match(text, /Hjemmesidepas · fase live · 750 kr\/md/);
  assert.match(text, /009 · 750 kr · sendt/);
  assert.match(text, /Lene foretrækker SMS/);
  assert.ok(dossierText(d, 200).length <= 200);
  assert.equal(await getDossier(db, "00000000-0000-0000-0000-000000000000", { today: "2026-09-22" }), null);
});

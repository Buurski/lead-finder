import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, deal, invoice, outreach, subscriptionPlan, task } from "../db/schema.ts";
import { getHqSummary, stepState } from "./summary.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const TODAY = "2026-09-22";

test("stepState: forfalden, snart (i dag/i morgen), ok, mangler", () => {
  assert.equal(stepState("2026-09-21", TODAY), "forfalden");
  assert.equal(stepState("2026-09-22", TODAY), "snart");
  assert.equal(stepState("2026-09-23", TODAY), "snart");
  assert.equal(stepState("2026-09-30", TODAY), "ok");
  assert.equal(stepState("", TODAY), "mangler");
});

test("HQ-tal læses korrekt fra Postgres", async () => {
  const [vida] = await db.insert(company).values([
    { rowNo: 2, name: "Svaret Ubehandlet", lifecycle: "svaret", emailStatus: "replied", leadStatus: "new", emailSentAt: new Date(Date.now() - 3 * 86_400_000).toISOString() },
    { rowNo: 40, name: "Svaret i maj", lifecycle: "svaret", emailStatus: "replied", leadStatus: "new", emailSentAt: "2026-05-12T09:00:00Z" },
    { rowNo: 3, name: "Svaret Behandlet", lifecycle: "interesseret", emailStatus: "replied", leadStatus: "interested" },
    { rowNo: 4, name: "Arkiveret", lifecycle: "ny", archived: true },
    { rowNo: -1, clientNo: 2, name: "VIDA Skønhedsklinik", lifecycle: "kunde" },
  ]).returning().then((r) => [r[4]]);
  await db.insert(deal).values([
    { companyId: vida.id, title: "Nyhedsbrev", stage: "i_gang", nextStep: "Send udkast", nextStepDue: "2026-09-20", owner: "lucas" },
    { companyId: vida.id, title: "Hjemmesidepas", stage: "betalt" }, // lukket → ingen næste skridt
  ]);
  await db.insert(task).values({ clientName: "Salon Artec", title: "Ring", due: "2026-09-23" });
  await db.insert(outreach).values([
    { id: "d1", status: "pending", draft: {} },
    { id: "d2", status: "sent", draft: {} },
  ]);
  const inv = (number: string, status: string, dueDate: string) => ({
    number, clientName: "VIDA Skønhedsklinik", status, issueDate: "2026-09-01", dueDate,
    data: { number, clientName: "VIDA Skønhedsklinik", recipient: { name: "VIDA" }, issueDate: "2026-09-01", dueDate, lines: [{ description: "Pas", amount: 750 }], vatRate: 0, status, payerType: "cvr" },
  });
  await db.insert(invoice).values([inv("009", "sendt", "2026-09-15"), inv("010", "betalt", "2026-09-15")]);
  await db.insert(subscriptionPlan).values({ clientName: "VIDA Skønhedsklinik", data: { clientName: "VIDA Skønhedsklinik", lines: [{ description: "Hosting", amount: 250 }, { description: "CMS", amount: 500 }], dayOfMonth: 15, active: true } });
  await db.insert(activity).values({ actor: "lucas", type: "note", summary: "Nyhedsbrev-skabelon færdig", at: new Date("2026-09-22T10:00:00Z") });

  const s = await getHqSummary(db, TODAY);
  assert.deepEqual(s.kpi, { draftsPending: 1, newReplies: 1, overdueNextSteps: 1 });
  assert.deepEqual(s.funnel.map((f) => f.n), [0, 0, 2, 1, 0]); // kunde uden lead-række tæller ikke; tragten tæller også gamle svar
  assert.deepEqual(s.nextSteps.map((x) => [x.company, x.state]), [["VIDA Skønhedsklinik", "forfalden"], ["Salon Artec", "snart"]]);
  assert.deepEqual(s.money, { mrr: 750, outstanding: 750, overdueCount: 1 });
  assert.equal(s.team[0].summary, "Nyhedsbrev-skabelon færdig");
  assert.equal(s.team[1].at, null);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOverview, mailDirection } from "./overview.ts";
import type { Dossier } from "./dossier.ts";

const NOW = Date.parse("2026-09-23T12:00:00Z");
const at = (iso: string) => new Date(iso);

function dossier(over: Partial<Dossier> = {}): Dossier {
  return {
    company: { clientNo: 3, clientRemoved: false, email: "", services: [] } as never,
    deals: [],
    contacts: [],
    activities: [],
    openTasks: [],
    invoices: [],
    balance: { unpaid: 0, overdue: 0 },
    site: null,
    notes: [],
    ...over,
  } as Dossier;
}

test("retning læses af Hermes' resuméer", () => {
  assert.equal(mailDirection("Svar sendt til Allan: vi står for opsætning"), "ud");
  assert.equal(mailDirection("Lucas modtog kundelisten og bad om fem afklaringer"), "ud");
  assert.equal(mailDirection("Allan spørger om vi kan lave et nyhedsbrev"), "ind");
  assert.equal(mailDirection("Lene svarer på faktura 009"), "ind");
  assert.equal(mailDirection("Nyhedsbrevet spurgt ind til igen: afventer stadig antal"), "ud");
  assert.equal(mailDirection("Lars (ditmedie.dk) skriver om vida-klinik.dk: to ting"), "ind");
});

test("KT VVS-mønstret: betalt, i gang, vi skrev sidst for 12 dage siden", () => {
  const o = buildOverview(
    dossier({
      deals: [{ title: "Hjemmeside", stage: "delivering", nextStep: "" } as never],
      activities: [{ type: "email", summary: "Påmindelse sendt til Kasper om tekster", at: at("2026-09-11T09:00:00Z"), actor: "hermes" } as never],
      invoices: [{ number: "004", status: "betalt", lines: [{ description: "Site", amount: 4000 }], vatRate: 0, issueDate: "2026-08-01" } as never],
    }),
    { subscription: null, unbilled: 0, now: NOW },
  );
  assert.ok(o.attention.some((a) => /Intet svar fra kunden i 12 dage — har betalt/.test(a.text)));
  assert.ok(o.attention.some((a) => /intet næste skridt/.test(a.text)));
  assert.deepEqual(o.missing, ["aftale/pris", "kontakt-mail", "domæne", "hvad vi leverer"]);
  assert.equal(o.money.invoicedTotal, 4000);
});

test("kunden skrev sidst → venter på os; aftale og ufaktureret vises", () => {
  const o = buildOverview(
    dossier({
      company: { clientNo: 2, clientRemoved: false, email: "x@y.dk", services: ["hjemmeside", "cms"] } as never,
      activities: [{ type: "email", summary: "Lene svarer på faktura 009", at: at("2026-09-21T09:00:00Z"), actor: "hermes" } as never],
      site: { status: "live", domain: "vida-klinik.dk", cmsUrl: null, lastDeployAt: null } as never,
      deals: [{ title: "Hjemmeside", stage: "live" } as never],
    }),
    { subscription: { clientName: "VIDA", lines: [{ description: "Hosting", amount: 250 }, { description: "CMS", amount: 500 }], dayOfMonth: 15, active: true }, unbilled: 1200, now: NOW },
  );
  assert.equal(o.attention[0].text, "Kunden venter på svar fra os (2 dage)");
  assert.equal(o.money.plan?.perMonth, 750);
  assert.ok(o.attention.some((a) => /1\.200 kr arbejde/.test(a.text)));
  assert.deepEqual(o.missing, []);
});

test("site nede → haster; SSL snart udløbet → obs", () => {
  const now = Date.parse("2026-09-23T10:00:00Z");
  const down = buildOverview(
    dossier({ site: { status: "live", domain: "vida-klinik.dk", cmsUrl: null, lastDeployAt: null, health: { ok: false, downSince: "2026-09-20T05:00:00Z" } } as never }),
    { subscription: null, unbilled: 0, now },
  );
  assert.ok(down.attention.some((a) => a.level === "haster" && a.text === "Sitet har ikke svaret i 3 dage"));
  const ssl = buildOverview(
    dossier({ site: { status: "live", domain: "vida-klinik.dk", cmsUrl: null, lastDeployAt: null, health: { ok: true, sslDaysLeft: 5 } } as never }),
    { subscription: null, unbilled: 0, now },
  );
  assert.ok(ssl.attention.some((a) => a.level === "obs" && a.text.includes("SSL")));
});

test("website i headeren dækker for manglende site.domain", () => {
  const o = buildOverview(
    dossier({
      company: { clientNo: 4, clientRemoved: false, email: "x@y.dk", services: ["hjemmeside"], website: "https://www.ktvvs.dk" } as never,
      deals: [{ title: "Hjemmeside", stage: "live" } as never],
      site: { status: "live", domain: "", cmsUrl: null, lastDeployAt: null } as never,
    }),
    { subscription: { clientName: "KT VVS", lines: [{ description: "Hosting", amount: 250 }], dayOfMonth: 15, active: true }, unbilled: 0, now: NOW },
  );
  assert.ok(!o.missing.includes("domæne"));
});

test("'Lucas modtog svar' er indgående", () => {
  assert.equal(mailDirection("Lucas modtog svar fra Henrik om tidsplanen"), "ind");
});

test("monthlyMoney: 12 måneder, kladder ude, efter fakturadato", async () => {
  const { monthlyMoney } = await import("./overview.ts");
  const inv = (number: string, status: string, issueDate: string, amount: number, paidAt?: string) =>
    ({ number, status, issueDate, paidAt, lines: [{ description: "x", amount }], vatRate: 0 }) as never;
  const rows = monthlyMoney(
    [
      inv("1", "betalt", "2026-08-20", 4000, "2026-09-02"),
      inv("2", "sendt", "2026-09-10", 750),
      inv("3", "kladde", "2026-09-12", 9999),
      inv("4", "betalt", "2025-01-05", 500),
    ],
    Date.parse("2026-09-25T10:00:00Z"),
  );
  assert.equal(rows.length, 12);
  assert.equal(rows[0].month, "2025-10");
  assert.equal(rows[11].month, "2026-09");
  assert.deepEqual(rows[10], { month: "2026-08", invoiced: 4000 });
  assert.deepEqual(rows[11], { month: "2026-09", invoiced: 750 });
  assert.equal(rows.reduce((s, r) => s + r.invoiced, 0), 4750);
});

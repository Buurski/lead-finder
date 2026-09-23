import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePsi, selectCustomerSites } from "./seo-history.ts";

test("parsePsi læser mobile scorer, målinger og konkrete fund", () => {
  const parsed = parsePsi({ lighthouseResult: {
    categories: { performance: { score: 0.68 }, seo: { score: 0.92 }, accessibility: { score: 1 }, "best-practices": { score: 0.81 } },
    audits: { "largest-contentful-paint": { numericValue: 2876.4, score: 0.5 }, "cumulative-layout-shift": { numericValue: 0.13, score: 0.7 }, "document-title": { score: 0 } },
  } });
  assert.equal(parsed.performance, 68);
  assert.equal(parsed.seo, 92);
  assert.equal(parsed.accessibility, 100);
  assert.equal(parsed.bestPractices, 81);
  assert.equal(parsed.lcpMs, 2876);
  assert.equal(parsed.cls, "0.13");
  assert.deepEqual(parsed.issues, ["Største indhold vises langsomt på mobil.", "Indholdet flytter sig under indlæsning.", "Siden mangler en tydelig titel."]);
  assert.deepEqual(parsePsi({}).issues, []);
});

test("selectCustomerSites foretrækker live-domæne og bruger website uden site", () => {
  const sites = selectCustomerSites([
    { companyId: "a", name: "A", website: "gammel.dk", domain: "nyt.dk", status: "live" },
    { companyId: "b", name: "B", website: "https://b.dk/side", domain: null, status: null },
    { companyId: "c", name: "C", website: "c.dk", domain: "demo.c.dk", status: "demo" },
  ]);
  assert.deepEqual(sites, [
    { companyId: "a", name: "A", url: "https://nyt.dk/" },
    { companyId: "b", name: "B", url: "https://b.dk/" },
  ]);
});

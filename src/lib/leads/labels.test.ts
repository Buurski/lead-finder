import { test } from "node:test";
import assert from "node:assert/strict";
import { isLabelValue, labelStats, type LeadLabel } from "./labels.ts";

const mk = (label: "god" | "daarlig", i: number): LeadLabel => ({
  draftId: `d${i}`, leadId: `l${i}`, name: `Firma ${i}`, branch: "Frisør", city: "Herning",
  label, jevLead: null, jevDraft: null, at: "2026-09-21T00:00:00Z",
});

test("isLabelValue afviser alt andet end de to værdier", () => {
  assert.equal(isLabelValue("god"), true);
  assert.equal(isLabelValue("daarlig"), true);
  for (const v of ["dårlig", "GOD", "", null, undefined, 1, {}]) assert.equal(isLabelValue(v), false);
});

test("labelStats tæller begge grupper", () => {
  const s = labelStats([mk("god", 1), mk("god", 2), mk("daarlig", 3)]);
  assert.deepEqual({ god: s.god, daarlig: s.daarlig }, { god: 2, daarlig: 1 });
});

test("nok kræver 25 i HVER gruppe — ikke 25 i alt", () => {
  const kunGode = Array.from({ length: 40 }, (_, i) => mk("god", i));
  assert.equal(labelStats(kunGode).nok, false, "40 gode og 0 dårlige kan man ikke måle på");
  const balanceret = [
    ...Array.from({ length: 25 }, (_, i) => mk("god", i)),
    ...Array.from({ length: 25 }, (_, i) => mk("daarlig", 100 + i)),
  ];
  assert.equal(labelStats(balanceret).nok, true);
  assert.equal(labelStats(balanceret.slice(0, 49)).nok, false, "24 i den ene gruppe er ikke nok");
});

test("tom liste er ikke nok, og vælter ikke", () => {
  assert.deepEqual(labelStats([]), { god: 0, daarlig: 0, nok: false });
});

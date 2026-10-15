import { test } from "node:test";
import assert from "node:assert/strict";
import { abVerdict, funnel, median, savesSharesPer1000 } from "./marketing-calc.ts";

const rep = (n: number, v: number) => Array.from({ length: n }, () => v);

test("median: tom, ulige, lige", () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("under 3 opslag pr. arm = for tidligt (grænsen 2 | 3)", () => {
  assert.equal(abVerdict(rep(2, 10), rep(9, 1)).verdict, "for-tidligt");
  assert.equal(abVerdict(rep(9, 1), rep(2, 10)).verdict, "for-tidligt");
  assert.equal(abVerdict([], []).verdict, "for-tidligt");
  assert.equal(abVerdict(rep(3, 10), rep(3, 5)).verdict, "signal");
});

test("3-4 opslag = signal, aldrig skær (grænsen 4 | 5)", () => {
  const four = abVerdict(rep(4, 10), rep(4, 1));
  assert.equal(four.verdict, "signal");
  assert.equal(four.ahead, "A");
  assert.equal(abVerdict(rep(5, 10), rep(4, 1)).verdict, "signal"); // kun den ene arm har 5
  assert.equal(abVerdict(rep(5, 10), rep(5, 1)).verdict, "skaer");
});

test("skær: præcis 25 % dårligere skærer, 24 % gør ikke", () => {
  assert.equal(abVerdict(rep(5, 100), rep(5, 75)).verdict, "skaer");
  assert.equal(abVerdict(rep(5, 100), rep(5, 76)).verdict, "signal");
  const r = abVerdict(rep(6, 60), rep(6, 100));
  assert.equal(r.verdict, "skaer");
  assert.equal(r.ahead, "B");
  assert.match(r.text, /Drop A/);
});

test("begge medianer 0 = ingen afgørelse; kun én på 0 er fuld forskel", () => {
  assert.equal(abVerdict(rep(5, 0), rep(5, 0)).verdict, "ingen-afgoerelse");
  assert.equal(abVerdict(rep(3, 0), rep(3, 0)).verdict, "ingen-afgoerelse");
  assert.equal(abVerdict(rep(5, 0), rep(5, 4)).verdict, "skaer");
  assert.equal(abVerdict(rep(3, 0), rep(3, 4)).verdict, "signal");
  // under 3 slår 0/0: for tidligt gælder først
  assert.equal(abVerdict(rep(2, 0), rep(2, 0)).verdict, "for-tidligt");
});

test("lige medianer er signal uden retning; medianen, ikke gennemsnittet, afgør", () => {
  const eq = abVerdict(rep(5, 7), rep(5, 7));
  assert.equal(eq.verdict, "signal");
  assert.equal(eq.ahead, null);
  // ét hit i A (outlier) flytter ikke medianen
  const r = abVerdict([1, 1, 1, 1, 500], [10, 10, 10, 10, 10]);
  assert.equal(r.medA, 1);
  assert.equal(r.verdict, "skaer");
  assert.equal(r.ahead, "B");
});

test("gem + delinger pr. 1000: kræver visninger, ellers null", () => {
  assert.equal(savesSharesPer1000({ views: 1000, saves: 20, shares: 10 }), 30);
  assert.equal(savesSharesPer1000({ views: 500, saves: 1, shares: null }), 2);
  assert.equal(savesSharesPer1000({ views: null, saves: 5, shares: 5 }), null);
  assert.equal(savesSharesPer1000({ views: 0, saves: 5, shares: 5 }), null);
  assert.equal(savesSharesPer1000({ views: 100, saves: null, shares: null }), null);
});

test("tragten: tom = null overalt, ikke 0; andel af forrige trin", () => {
  const none = funnel([]);
  assert.equal(none.posts, 0);
  assert.ok(none.steps.every((s) => s.value === null && s.ofPrev === null));
  const f = funnel([
    { views: 1000, saves: 20, shares: 10, profileVisits: 15, inquiries: null },
    { views: 500, saves: null, shares: 5, profileVisits: null, inquiries: 1 },
  ]);
  assert.equal(f.posts, 2);
  assert.deepEqual(f.steps.map((s) => s.value), [1500, 35, 15, 1]);
  assert.equal(f.steps[1].ofPrev, 2.3);
  assert.equal(f.steps[0].ofPrev, null);
});

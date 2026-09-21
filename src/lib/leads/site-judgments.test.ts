import { test } from "node:test";
import assert from "node:assert/strict";
import { attractiveness, toJudgment, type SiteJudgment } from "./site-judgments.ts";
import { jevAsk } from "../jev.ts";

const base: SiteJudgment = {
  redesign: 2.5,
  cta: 1,
  lokal: 0.9,
  dateretSprog: 0.7,
  onlineBooking: 0.1,
  eeat: "kontakt",
  eeatConfidence: 0.8,
  budget: "middel",
  budgetConfidence: 0.7,
  virksomhedstype: "lokal_ejerledet",
  virksomhedstypeConfidence: 0.8,
  lignerKunde: 0.9,
};


// --- NY formel 2026-09-21: aktivitet x egnethed x gates (AUC 0,834 mod 0,445) ---

const grund: SiteJudgment = {
  redesign: 2.5, cta: 1, lokal: 0.9, dateretSprog: 0.7, onlineBooking: 0.1,
  eeat: "kontakt", eeatConfidence: 0.8, budget: "middel", budgetConfidence: 0.8,
  virksomhedstype: "lokal_ejerledet", virksomhedstypeConfidence: 0.9, lignerKunde: 0.9,
};

test("anmeldelsestallet driver scoren — 0 anmeldelser giver 0", () => {
  // Det målte hovedsignal (AUC 0,852). Median: interested 61 anmeldelser, bad_fit 0.
  assert.equal(attractiveness(grund, { isChain: false, reviewsCount: 0 }).score, 0);
  const faa = attractiveness(grund, { isChain: false, reviewsCount: 8 }).score;
  const mange = attractiveness(grund, { isChain: false, reviewsCount: 120 }).score;
  assert.ok(faa > 0 && faa < mange, `${faa} skal ligge mellem 0 og ${mange}`);
  assert.ok(mange >= 85, `en etableret forretning skal score højt, fik ${mange}`);
});

test("redesign-behov løfter IKKE længere scoren", () => {
  // Målt AUC 0,260 — omvendt fortegn. En elendig side er ikke et godt lead.
  const daarligSide = attractiveness({ ...grund, redesign: 3 }, { isChain: false, reviewsCount: 100 }).score;
  const okSide = attractiveness({ ...grund, redesign: 1.5 }, { isChain: false, reviewsCount: 100 }).score;
  assert.equal(daarligSide, okSide);
});

test("en allerede god side er stadig en gate — der er intet at sælge", () => {
  const god = attractiveness({ ...grund, redesign: 0.5 }, { isChain: false, reviewsCount: 100 }).score;
  const slidt = attractiveness(grund, { isChain: false, reviewsCount: 100 }).score;
  assert.ok(god < slidt * 0.5, `${god} skal være markant under ${slidt}`);
});

test("gates kan ikke opvejes af et højt anmeldelsestal (Alchemist-sagen)", () => {
  const facts = { isChain: false, reviewsCount: 800 };
  const normal = attractiveness(grund, facts).score;
  for (const [navn, j] of [
    ["kæde", grund],
    ["stor/landskendt", { ...grund, virksomhedstype: "stor_eller_landskendt" as const }],
    ["offentlig", { ...grund, virksomhedstype: "offentlig_eller_forening" as const }],
  ] as const) {
    const medGate = navn === "kæde"
      ? attractiveness(j, { ...facts, isChain: true }).score
      : attractiveness(j, facts).score;
    assert.ok(medGate < 25, `${navn}: ${medGate} skal være lavt trods 800 anmeldelser (normal ${normal})`);
  }
});

test("bureau/konkurrent lukkes ned", () => {
  const facts = { isChain: false, reviewsCount: 200 };
  assert.ok(attractiveness(grund, { ...facts, isAgency: true }).score < 10);
  assert.ok(attractiveness(grund, facts).score > 50);
});

test("hovedstaden dæmper, men slår ikke ihjel", () => {
  const facts = { isChain: false, reviewsCount: 200 };
  const hjemme = attractiveness(grund, facts).score;
  const kbh = attractiveness(grund, { ...facts, outOfTerritory: true }).score;
  assert.ok(kbh < hjemme && kbh > hjemme * 0.4, `${kbh} mod ${hjemme}`);
});

test("aktiv_forretning er stadig konservativ — 0,4 straffes ikke", () => {
  const facts = { isChain: false, reviewsCount: 200 };
  const basis = attractiveness(grund, facts).score;
  assert.equal(attractiveness({ ...grund, aktivForretning: 0.4 }, facts).score, basis);
  assert.ok(attractiveness({ ...grund, aktivForretning: 0.1 }, facts).score < basis);
});

test("toJudgment returns null when an answer is missing", () => {
  assert.equal(toJudgment(undefined), null);
  assert.equal(toJudgment({ redesign: { type: "score", score: 2, confidence: 0.9, probabilities: {} } }), null);
});

test("toJudgment maps a full answer set", () => {
  const j = toJudgment({
    redesign: { type: "score", score: 2.2, confidence: 0.9, probabilities: {} },
    cta: { type: "score", score: 1, confidence: 0.9, probabilities: {} },
    lokal: { type: "noul", noul: 0.95 },
    dateret_sprog: { type: "noul", noul: 0.6 },
    online_booking: { type: "noul", noul: 0.05 },
    eeat: { type: "choice", choice: "fuld", confidence: 0.8, probabilities: {} },
    budget_signal: { type: "choice", choice: "hoejt", confidence: 0.6, probabilities: {} },
    virksomhedstype: { type: "choice", choice: "lokal_ejerledet", confidence: 0.7, probabilities: {} },
    ligner_kinlys_kunder: { type: "noul", noul: 0.85 },
  });
  assert.ok(j);
  assert.equal(j?.budget, "hoejt");
  assert.equal(j?.eeat, "fuld");
});

test("jevAsk returns null without a key and makes no network call", async () => {
  const saved = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  try {
    const r = await jevAsk({ x: 1 }, { q: { type: "noul", instructions: "?" } });
    assert.equal(r, null);
  } finally {
    if (saved) process.env.TYPESAFE_API_KEY = saved;
  }
});

test("national brand / not-our-customer / review volume are penalised (the Alchemist case)", () => {
  const big = attractiveness({ ...base, virksomhedstype: "stor_eller_landskendt", lignerKunde: 0.1 }, { isChain: false, reviewsCount: 2400 });
  // Michelin-restauranten har flest anmeldelser af alle — netop derfor skal
  // gaten gange ned, ikke trække fra: 2.400 anmeldelser må aldrig kunne købe
  // sig op igen. Den lokale med 40 anmeldelser skal ligge klart over.
  assert.ok(big.score < 10, `stor/landskendt fik ${big.score}`);
  assert.ok(big.reasons.some((x) => x.includes("landskendt")));
  const local = attractiveness(base, { isChain: false, reviewsCount: 40 });
  assert.ok(local.score > big.score * 5, `lokal ${local.score} mod stor ${big.score}`);
});


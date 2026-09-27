import { test } from "node:test";
import assert from "node:assert/strict";
import { draft_personal_message } from "./draft.ts";
import type { ResearchLead, ResearchResult } from "./research.ts";
import { DEMO_SITES, pickDemos, referenceLines } from "./demos.ts";

function lead(name: string): ResearchLead {
  return {
    name, branch: "hudpleje", score: 70, website: "", websiteStatus: "none",
    websiteQualityTier: "", reviewsCount: 40, notes: "", enrichedInfo: "", city: "Skagen",
  };
}

function research(): ResearchResult {
  return {
    hooks: [], professionalismVerdict: { ok: true, reason: "test" }, branch: "hudpleje",
    demoPair: [], sources: [], achievements: [],
  };
}

// Bug fixed 2026-09-23: the engine's deterministic composer greeted with the
// raw business name — "Hej Gitte Gylvig Skin & Welness,". useLLM defaults to
// false (opts.useLLM undefined), so this exercises the deterministic path with
// no network/AI key needed.
test("draft_personal_message greeting — Gitte Gylvig Skin & Welness -> Hej Gitte,", async () => {
  const d = await draft_personal_message(lead("Gitte Gylvig Skin & Welness"), research(), "voice guide");
  assert.ok(d.body.startsWith("Hej Gitte,\n"), d.body.split("\n")[0]);
});

test("draft_personal_message greeting — Skagen Sundhedsklinik.dk -> Hej,", async () => {
  const d = await draft_personal_message(lead("Skagen Sundhedsklinik.dk"), research(), "voice guide");
  assert.ok(d.body.startsWith("Hej,\n"), d.body.split("\n")[0]);
});

test("draft_personal_message greeting — Hos Anne Marie -> Hej Anne Marie,", async () => {
  const d = await draft_personal_message(lead("Hos Anne Marie"), research(), "voice guide");
  assert.ok(d.body.startsWith("Hej Anne Marie,\n"), d.body.split("\n")[0]);
});

test("draft_personal_message greeting — Restaurant Klosterkroen -> Hej,", async () => {
  const d = await draft_personal_message(lead("Restaurant Klosterkroen"), research(), "voice guide");
  assert.ok(d.body.startsWith("Hej,\n"), d.body.split("\n")[0]);
});

// ---- Demo-løftet skal matche det mailen FAKTISK viser (26/9) ----------------
// Tømrer og vinduespudser har intet demo-par (pickDemos → []), så kladden må
// ikke love "et par demoer" eller "eksempler" — kun de ærlige linklinjer fra
// referenceLines (her: kinly.dk-forsiden). Maler/VVS har links og beholder dem.
const PROMISE = /Jeg lavede et par demoer|Sådan kunne det fx se ud|Bedst hvis I selv kigger|Det er bare eksempler|Det er kun for at vise idéen/;
const linksIn = (text: string) => [...text.matchAll(/^→\s*(\S+)$/gm)].map((m) => m[1]);

function researchFor(branch: string, name: string): ResearchResult {
  return { ...research(), branch, demoPair: pickDemos(branch, name) };
}

function leadFor(name: string, branch: string): ResearchLead {
  return { ...lead(name), branch };
}

test("tømrer uden demo-par: ingen demo-løfte, kun forside-linket", async () => {
  const name = "Tømrer Hansen";
  const d = await draft_personal_message(leadFor(name, "tømrer"), researchFor("tømrer", name), "voice guide");
  assert.deepEqual(d.demoPair, []);
  assert.equal(PROMISE.test(d.body), false, d.body);
  assert.deepEqual(linksIn(d.body), referenceLines("tømrer", name).map((l) => l.slice(2)));
  assert.deepEqual(linksIn(d.body), ["https://kinly.dk/"]);
  // 27/9: en nøgen URL alene læser skidt — introen kommer fra referenceIntro,
  // præcis som i compose.ts.
  assert.equal(d.body.split("\n\n").find((p) => p.includes("→ ")), "Her er min egen side.\n→ https://kinly.dk/", d.body);
});

test("vinduespudser uden demo-par: ingen demo-løfte", async () => {
  const name = "Polering Vest";
  const d = await draft_personal_message(leadFor(name, "vinduespudser"), researchFor("vinduespudser", name), "voice guide");
  assert.deepEqual(d.demoPair, []);
  assert.equal(PROMISE.test(d.body), false, d.body);
});

test("maler og VVS beholder demo-linjen og deres links", async () => {
  const maler = await draft_personal_message(leadFor("Maler Mikkelsen", "maler"), researchFor("maler", "Maler Mikkelsen"), "voice guide");
  assert.equal(PROMISE.test(maler.body), true, maler.body);
  assert.ok(linksIn(maler.body).includes(DEMO_SITES.denlillemaler));

  const vvs = await draft_personal_message(leadFor("VVS Hansen", "vvs"), researchFor("vvs", "VVS Hansen"), "voice guide");
  assert.equal(PROMISE.test(vvs.body), true, vvs.body);
  assert.deepEqual(linksIn(vvs.body), referenceLines("vvs", "VVS Hansen").map((l) => l.slice(2)));
  assert.ok(linksIn(vvs.body).includes(DEMO_SITES.ktvvsCase), vvs.body);
});

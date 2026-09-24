import { test } from "node:test";
import assert from "node:assert/strict";
import { draft_personal_message } from "./draft.ts";
import type { ResearchLead, ResearchResult } from "./research.ts";

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

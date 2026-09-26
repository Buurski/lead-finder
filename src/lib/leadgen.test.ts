import test from "node:test";
import assert from "node:assert/strict";
import { normalizeIngest, isStaleLeadgen, orderForIngest, ingestAllowance, websiteStatusFor } from "./leadgen.ts";
import { socialKind, fbFit } from "./leads/social-fit.ts";

// 26/9: FB-only leads fik "jeres side virker et par år gammel", og alle andre
// fik "old" uanset copyright-år. Mailen må aldrig påstå noget, vi ikke har målt.
test("websiteStatusFor — Facebook = ingen side, målt status vinder, ellers old", () => {
  assert.equal(websiteStatusFor({}), "none");
  assert.equal(websiteStatusFor({ website: "https://www.facebook.com/aekalgo/" }), "none");
  assert.equal(websiteStatusFor({ website: "https://instagram.com/zin" }), "ok", "IG: ingen påstand (none-opener nævner Facebook)");
  assert.equal(websiteStatusFor({ website: "https://www.krak.dk/x", websiteStatus: "old" }), "ok");
  assert.equal(websiteStatusFor({ website: "https://vida.dk", websiteStatus: "ok" }), "ok");
  assert.equal(websiteStatusFor({ website: "https://vida.dk", websiteStatus: "old" }), "old");
  assert.equal(websiteStatusFor({ website: "https://vida.dk" }), "old", "gamle filer uden status: uændret");
  assert.equal(websiteStatusFor({ website: "https://vida.dk", site_issues: ["timeout"] }), "dead");
});

test("socialKind + fbFit — kun for store straffes, ingen Facebook er fint", () => {
  assert.equal(socialKind("facebook.com/x"), "facebook");
  assert.equal(socialKind("https://m.facebook.com/x"), "facebook");
  assert.equal(socialKind("https://www.krak.dk/a"), "directory");
  assert.equal(socialKind("https://notfacebook.com"), null);
  assert.equal(socialKind("https://vida.dk"), null);
  assert.equal(socialKind(""), null);
  assert.equal(fbFit(null), 0, "ingen Facebook = neutral");
  assert.equal(fbFit(32_474), -100, "for stor = ude uanset score (Dirty Ranch, 26/9)");
  assert.equal(fbFit(10_000), 0, "grænsen er inklusiv");
  assert.equal(fbFit(800), 0, "lille side = neutral, ingen bonus");
});

test("normalizeIngest bevarer bureau og hasViewport", () => {
  const [lead] = normalizeIngest([{ name: "KT VVS", bureau: true, hasViewport: false }]);
  assert.equal(lead.bureau, true);
  assert.equal(lead.hasViewport, false);
});

test("normalizeIngest defaulter manglende signaler til null", () => {
  const [lead] = normalizeIngest([{ name: "Uden Signaler" }]);
  assert.equal(lead.hasViewport, null);
  assert.equal(lead.copyrightYear, null);
  assert.equal(lead.bureau, undefined);
});

test("isStaleLeadgen — gårsdagens eller manglende fil er ikke frisk", () => {
  const now = Date.parse("2026-09-25T06:30:00Z");
  assert.equal(isStaleLeadgen("2026-09-25T04:01:20Z", now), false);
  assert.equal(isStaleLeadgen("2026-09-24T04:01:20Z", now), true);
  assert.equal(isStaleLeadgen(undefined, now), true);
  assert.equal(isStaleLeadgen("ikke en dato", now), true);
});

test("orderForIngest — mail først, så højeste fitScore", () => {
  const out = orderForIngest([
    { name: "a", email: null, fitScore: 99 },
    { name: "b", email: "hej@b.dk", fitScore: 70 },
    { name: "c", email: "hej@c.dk", fitScore: 90 },
  ]);
  assert.deepEqual(out.map((x) => x.name), ["c", "b", "a"]);
});

test("ingestAllowance — loftet gælder pr. leadgen-fil, ikke pr. kørsel", () => {
  const at = "2026-09-25T04:01:20Z";
  const mk = (n: number, createdAt: string, source = "leadgen-ingest") => Array.from({ length: n }, () => ({ source, createdAt }));
  assert.equal(ingestAllowance([], at), 20);
  assert.equal(ingestAllowance(mk(12, "2026-09-25T06:30:05Z"), at), 8, "anden kørsel samme fil");
  assert.equal(ingestAllowance(mk(25, "2026-09-25T06:30:05Z"), at), 0);
  assert.equal(ingestAllowance(mk(20, "2026-09-24T06:30:05Z"), at), 20, "gårsdagens tæller ikke");
  assert.equal(ingestAllowance(mk(20, "2026-09-25T02:00:00Z"), at), 0, "samme UTC-dag, tidligere fil (genkørt VPS) tæller");
  assert.equal(ingestAllowance(mk(20, "2026-09-25T06:30:05Z", "daily-engine"), at), 20, "andre kilder tæller ikke");
  assert.equal(ingestAllowance(mk(5, "2026-09-25T04:01:30Z", "places-direct"), at), 15, "VPS-apply fra samme fil tæller med");
});

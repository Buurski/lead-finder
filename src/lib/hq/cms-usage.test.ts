import { test } from "node:test";
import assert from "node:assert/strict";
import { cmsSlug, slugMatches } from "./cms-usage.ts";

test("kundenavn matcher CMS-slug", () => {
  assert.equal(slugMatches("Jernbanecaféen", "jernbane-cafeen"), true);
  assert.equal(slugMatches("VIDA Skønhedsklinik", "vida"), true);
  assert.equal(slugMatches("KT VVS", "httktvvs"), true);
  assert.equal(slugMatches("Ikast AutoService", "vida"), false);
  assert.equal(slugMatches("Mellow", "mellownu"), true);
  assert.equal(cmsSlug("https://kinly-cms.vercel.app/e/lej-en-kok"), "lej-en-kok");
});

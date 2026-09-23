import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanMarkdown, markdownSections, renderMarkdown } from "./md.ts";

test("viser afsnit, overskrifter, lister, fed tekst og sikre links", () => {
  const html = renderMarkdown("# Titel\n\nEt **vigtigt** [link](https://example.dk/x?a=1&b=2).\n\n- Første\n* Anden");
  assert.match(html, /<h1>Titel<\/h1>/);
  assert.match(html, /<strong>vigtigt<\/strong>/);
  assert.match(html, /href="https:\/\/example.dk\/x\?a=1&amp;b=2"/);
  assert.match(html, /<ul><li>Første<\/li><li>Anden<\/li><\/ul>/);
});

test("escaper HTML og tillader ikke javascript-links", () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)"> [klik](javascript:alert(1))');
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /&lt;img/);
});

test("rydder frontmatter og wiki-links og deler ved niveau to", () => {
  const raw = "---\ntitle: Hemmeligt\n---\nIntro [[Kunde|Kunden]]\n\n## Aftale\n**Aktiv**\n## Noter\nTekst";
  assert.equal(cleanMarkdown(raw).includes("title:"), false);
  assert.deepEqual(markdownSections(raw), [
    { title: null, body: "Intro Kunden\n" },
    { title: "Aftale", body: "**Aktiv**" },
    { title: "Noter", body: "Tekst" },
  ]);
});

// 27/9: demo-løftet afgøres af linkenes ROLLE, ikke af antallet af links.
// Forside + case + branche-side er tre kinly.dk-links uden en enkelt demo, og så
// må hverken draft, den legacy compose-vej eller opfølgningens "eksempel"-vinkel
// love demoer eller eksempler. Opfølgningen må heller ikke påstå at linket viser
// "nogle af de sider jeg har bygget", når blokken kun har forsiden.
//
// RØD på agent/0927-1757-lead-system @ 06f49fa (VVS/klinik/beauty fik demoIntro
// og tailorLine på tre links uden demo), grøn efter rettelsen.
import { test } from "node:test";
import assert from "node:assert/strict";
import { draft_personal_message } from "./draft.ts";
import { composeColdEmail } from "./compose.ts";
import { composeStep } from "./hq/sequence.ts";
import { DEMO_SITES, KINLY_FRONT, REFERENCE_INTRO, referenceLines } from "./demos.ts";
import type { ResearchLead, ResearchResult } from "./research.ts";

const OWN_SITE_INTRO = "Her er min egen side.";
const EKSEMPEL_INTRO = "Hvis I hellere vil se det end læse om det, har jeg lagt min side nedenfor.";
// Alle demo-/eksempel-løfter skabelonerne kender (draft, compose, sequence).
const DEMO_PROMISE =
  /Jeg lavede et par demoer|Sådan kunne det fx se ud|Bedst hvis I selv kigger|Det er bare eksempler|Det er kun for at vise idéen|nogle af de sider jeg har bygget|kundernes egne farver/;
const linksIn = (text: string) => [...text.matchAll(/^→\s*(\S+)$/gm)].map((m) => m[1]);

function leadFor(name: string, branch: string): ResearchLead {
  return {
    name, branch, score: 70, website: "", websiteStatus: "none", websiteQualityTier: "",
    reviewsCount: 40, notes: "", enrichedInfo: "", city: "Ikast",
  };
}

function researchFor(branch: string, name: string): ResearchResult {
  return { hooks: [], professionalismVerdict: { ok: true, reason: "test" }, branch, demoPair: [], sources: [], achievements: [] };
}

// demo: har linkblokken et ÆGTE demo-link (ikke forside, ikke case, ikke branche-side)?
const CASES = [
  { branch: "vvs", name: "VVS Hansen", demo: false, links: [KINLY_FRONT, DEMO_SITES.ktvvsCase, "https://kinly.dk/hjemmeside-til-vvs/"] },
  { branch: "skønhedsklinik", name: "Klinik Nørre", demo: false, links: [KINLY_FRONT, DEMO_SITES.vidaCase, "https://kinly.dk/hjemmeside-til-skoenhedsklinik/"] },
  { branch: "beauty", name: "Beauty Studio Ikast", demo: false, links: [KINLY_FRONT, DEMO_SITES.vidaCase, "https://kinly.dk/hjemmeside-til-skoenhedsklinik/"] },
  { branch: "tømrer", name: "Tømrer Hansen", demo: false, links: [KINLY_FRONT] },
  { branch: "vinduespudser", name: "Polering Vest", demo: false, links: [KINLY_FRONT] },
  { branch: "maler", name: "Maler Mikkelsen", demo: true, links: [KINLY_FRONT, DEMO_SITES.denlillemaler] },
];

const introFor = (links: string[]) => (links.length > 1 ? REFERENCE_INTRO : OWN_SITE_INTRO);
const para = (links: string[]) => [introFor(links), ...links.map((u) => `→ ${u}`)].join("\n");

test("draft: demo-løftet følger linkenes rolle, ikke antallet", async () => {
  for (const c of CASES) {
    const where = `draft ${c.branch}`;
    const d = await draft_personal_message(leadFor(c.name, c.branch), researchFor(c.branch, c.name), "voice guide");
    // Linkene er præcis dem referenceLines giver — intet opdigtet, intet udeladt.
    assert.deepEqual(linksIn(d.body), c.links, where);
    assert.deepEqual(linksIn(d.body), referenceLines(c.branch, c.name).map((l) => l.slice(2)), where);
    assert.equal(DEMO_PROMISE.test(d.body), c.demo, `${where}: ${d.body}`);
    const linkPara = d.body.split("\n\n").find((p) => p.includes("→ "));
    assert.ok(linkPara, where);
    // Uden demo står introen fra referenceIntro i samme afsnit som linkene.
    if (!c.demo) assert.equal(linkPara, para(c.links), `${where}: ${d.body}`);
  }
});

test("legacy compose: demo-løftet følger linkenes rolle, ikke antallet", () => {
  for (const c of CASES) {
    const where = `compose ${c.branch}`;
    const m = composeColdEmail({ name: c.name, branch: c.branch, city: "Ikast", hooks: [] });
    assert.deepEqual(linksIn(m.text), c.links, where);
    assert.equal(DEMO_PROMISE.test(m.text), c.demo, `${where}: ${m.text}`);
    assert.equal(DEMO_PROMISE.test(m.html), c.demo, `${where}: ${m.html}`);
    if (!c.demo) {
      const linkPara = m.text.split("\n\n").find((p) => p.includes("→ "));
      assert.equal(linkPara, para(c.links), `${where}: ${m.text}`);
      const htmlParas = [...m.html.matchAll(/<p style="margin:0 0 14px;line-height:1.6">([\s\S]*?)<\/p>/g)].map((x) => x[1]);
      const htmlLinkPara = htmlParas.find((p) => p.includes("<a href"));
      assert.ok(htmlLinkPara?.startsWith(introFor(c.links)), `${where}: ${m.html}`);
    }
  }
});

test("sequence 'eksempel': ingen påstand om sider vi ikke viser", () => {
  for (const c of CASES) {
    const where = `sequence ${c.branch}`;
    const s = composeStep({ name: c.name, branch: c.branch, website: "x.dk" }, "eksempel");
    assert.deepEqual(linksIn(s.body), c.links, where);
    assert.equal(DEMO_PROMISE.test(s.body), false, `${where}: ${s.body}`);
    assert.ok(s.body.includes(EKSEMPEL_INTRO), where);
    assert.ok(s.body.includes(`En side til ${c.name} skulle selvfølgelig passe til jeres eget udtryk.`), where);
    assert.ok(s.body.includes("Skal jeg sende et udkast?"), where);
    const linkPara = s.body.split("\n\n").find((p) => p.includes("→ "));
    assert.equal(linkPara, para(c.links), `${where}: ${s.body}`);
  }
});

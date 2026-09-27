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
import { DEMO_SITES, KINLY_FRONT, REFERENCE_INTRO, hasDemoPromise, referenceLines } from "./demos.ts";
import type { ResearchLead, ResearchResult } from "./research.ts";
import { __setStore, InMemoryStore } from "./store.ts";

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

// ---- 28/9: de sidste to huller i demo-løfte-heuristikken --------------------
// RØD på agent/0928-0056-lead-system @ 14d4ffd: "sider jeg har lavet" og "sider
// vi selv har bygget" slap igennem, og DEMO_LOOK_NOW tændte kun på "→ https://"
// — ikke på "- ", "* ", "Se: " og "Her: ".
test("hasDemoPromise: synonym-påstande om egne sider fanges", () => {
  for (const t of [
    "her er et par sider jeg har lavet",
    "to sider vi selv har bygget",
    "se et par eksempler jeg selv har lavet",
  ]) {
    assert.equal(hasDemoPromise(t), true, t);
  }
});

test("hasDemoPromise: andre linklinje-præfikser tæller med DEMO_LOOK_NOW", () => {
  const lookNow = "Sådan kan jeres side se ud";
  for (const p of ["→ ", "- ", "* ", "Se: ", "Her: "]) {
    assert.equal(hasDemoPromise(`${p}https://kinly.dk/\n${lookNow}`), true, p);
  }
  // Uden linklinje er nutids-præsentationen alene ikke et løfte.
  assert.equal(hasDemoPromise(`Her er min egen side.\n${lookNow}`), false);
});

test("hasDemoPromise: de ærlige linjer og udkast-tilbuddet er ikke et løfte", () => {
  for (const t of [
    REFERENCE_INTRO,
    "Her er min egen side.",
    "Hvis I har lyst, laver jeg gerne et gratis udkast til hvordan en side for Test VVS ApS kunne se ud, så kan I vurdere idéen helt konkret.",
  ]) {
    assert.equal(hasDemoPromise(t), false, t);
  }
});

// ---- Accept-stedet: LLM-kladden må ikke love demoer vi ikke linker (27/9) ---
// Røret testes direkte i draft_personal_message: ANTHROPIC_API_KEY sættes lokalt
// og globalThis.fetch giver et fast svar, så intet netværkskald sker — men
// accept-branchen er den ægte (derfor tælles kaldet). Teksten KASSERES, den
// omskrives ikke: kladden falder tilbage til den deterministiske, præcis som når
// linkene mangler.
const LLM_PROMISE_LINE = "jeg har lavet et par demoer, se dem herunder";

function llmDemoBody(branch: string, name: string): string {
  return [
    "Hej,",
    "",
    `${LLM_PROMISE_LINE}. En side til ${name} kunne samle det hele ét sted.`,
    "",
    ...referenceLines(branch, name),
  ].join("\n");
}

test("LLM-kladde med demo-løfte kasseres uden et demo-link — og bevares når linket er der", async () => {
  const realFetch = globalThis.fetch;
  const realKey = process.env.ANTHROPIC_API_KEY;
  const realGateway = process.env.AI_GATEWAY_API_KEY;
  const realDisabled = process.env.AI_DISABLED;
  let reply = "";
  let calls = 0;
  try {
    // Ingen rigtig hukommelse: isOverDailyCap læser spend-loggen FØR fetch, og
    // trackSpend skriver bagefter. Begge skal ramme InMemoryStore, ellers læser
    // testen den ægte .send_queue/spend.jsonl og skriver syntetiske rækker i den.
    __setStore(new InMemoryStore());
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.AI_DISABLED;
    process.env.ANTHROPIC_API_KEY = "test-no-network";
    globalThis.fetch = (async () => {
      calls++;
      return new Response(JSON.stringify({ content: [{ text: reply }], usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const voice = "voice guide";

    // VVS: forside + KT VVS-case + branche-side = ingen demo. Løftet må ikke igennem.
    reply = llmDemoBody("vvs", "VVS Hansen");
    const vvs = await draft_personal_message(leadFor("VVS Hansen", "vvs"), researchFor("vvs", "VVS Hansen"), voice, { useLLM: true });
    assert.equal(calls, 1, "accept-stedet testes, ikke en isoleret helper");
    const vvsDet = await draft_personal_message(leadFor("VVS Hansen", "vvs"), researchFor("vvs", "VVS Hansen"), voice);
    assert.equal(vvs.body, vvsDet.body, vvs.body);
    assert.equal(vvs.body.includes(LLM_PROMISE_LINE), false, vvs.body);

    // Tømrer: kun forsiden tilbage. Samme svar.
    reply = llmDemoBody("tømrer", "Tømrer Hansen");
    const toemrer = await draft_personal_message(leadFor("Tømrer Hansen", "tømrer"), researchFor("tømrer", "Tømrer Hansen"), voice, { useLLM: true });
    assert.equal(toemrer.body.includes(LLM_PROMISE_LINE), false, toemrer.body);

    // Maler: linkblokken HAR et ægte demo-link (denlillemaler.vercel.app), så
    // løftet er sandt og LLM-teksten står uændret.
    reply = llmDemoBody("maler", "Maler Mikkelsen");
    const maler = await draft_personal_message(leadFor("Maler Mikkelsen", "maler"), researchFor("maler", "Maler Mikkelsen"), voice, { useLLM: true });
    assert.ok(maler.body.includes(LLM_PROMISE_LINE), maler.body);
    assert.ok(maler.body.includes(DEMO_SITES.denlillemaler), maler.body);

    // Maler med løftet, men KUN forsiden i kroppen: demo-linket (denlillemaler)
    // mangler. Maler-branchen har hverken case eller branche-side, så linksOk er
    // stadig sand — kun demo-løfte-værnet kan kassere kladden. RØD før rettelsen:
    // løftet gik igennem på forsiden alene og lovede en demo kroppen ikke viste.
    reply = [
      "Hej,",
      "",
      `${LLM_PROMISE_LINE}. En side til Maler Mikkelsen kunne samle det hele ét sted.`,
      "",
      `→ ${KINLY_FRONT}`,
    ].join("\n");
    const malerUdenDemo = await draft_personal_message(leadFor("Maler Mikkelsen", "maler"), researchFor("maler", "Maler Mikkelsen"), voice, { useLLM: true });
    assert.equal(malerUdenDemo.body.includes(LLM_PROMISE_LINE), false, malerUdenDemo.body);
    const malerUdenDemoDet = await draft_personal_message(leadFor("Maler Mikkelsen", "maler"), researchFor("maler", "Maler Mikkelsen"), voice);
    assert.equal(malerUdenDemo.body, malerUdenDemoDet.body, malerUdenDemo.body);
  } finally {
    __setStore(null);
    globalThis.fetch = realFetch;
    if (realKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = realKey;
    if (realGateway === undefined) delete process.env.AI_GATEWAY_API_KEY; else process.env.AI_GATEWAY_API_KEY = realGateway;
    if (realDisabled === undefined) delete process.env.AI_DISABLED; else process.env.AI_DISABLED = realDisabled;
  }
});

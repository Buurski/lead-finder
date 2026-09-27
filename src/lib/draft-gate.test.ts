// draft-gate.test.ts — preflight (GET /api/approve/send) og sendeløkken (POST i
// samme fil) skal svare ENS om hvorfor et udkast ikke må ud.
//
// 27/9 gav de to veje forskellige grunde for PRÆCIS samme kunde-URL: preflighten
// svarede "link-politik: kundens egen side må ikke linkes (…)" fordi den kaldte
// demos.ts#linkGateReason, mens sendeløkken kørte validateDraft først og svarede
// "voice-guide: kunde-link: …". Samme kladde, to sandheder. Nu beregner begge
// parter grunden med draft.ts#draftGateReason, og testen her låser rækkefølgen:
// link-politik → voice-guide → signatur → emne.
//
// Ingen sender kaldes: hele testen rører kun rene funktioner. POST-løkken kunne
// ikke kaldes sikkert herfra (den reserverer kø-rækker og taler med Sheets/KV),
// så route-koblingen bevises i stedet på kildekoden nedenfor.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { draftGateReason, validateDraft, voiceGateReason, type GateDraft } from "./draft.ts";
import { CUSTOMER_SITES, DEMO_SITES, KINLY_FRONT, REFERENCE_INTRO, hasDemoLink, hasDemoPromise, referenceLines } from "./demos.ts";

const ROUTE_SRC = readFileSync(new URL("../app/api/approve/send/route.ts", import.meta.url), "utf8");
const BRANCH = "vvs";
const NAME = "Test VVS ApS";
const SENDER = "lucas" as const;

/** Et udkast der opfylder link-politikken (forside + case + branche-side). */
function body(extra = ""): string {
  const links = referenceLines(BRANCH, NAME).join("\n");
  return `Hej,\n\n${REFERENCE_INTRO}\n${links}\n${extra ? `${extra}\n` : ""}\nMed venlig hilsen\nLucas`;
}

const draft = (extra = "", subject = `Tilbud til ${NAME}`) => ({ body: body(extra), subject, branch: BRANCH, name: NAME });

test("kundens egen side: samme blokårsag som preflighten viste, ikke voice-guide", () => {
  for (const url of [CUSTOMER_SITES.ktvvs, CUSTOMER_SITES.ktvvsPreview]) {
    const d = draft(`Se ${url}`);
    const reason = draftGateReason(d, SENDER);
    assert.ok(reason, `${url} skal blokere`);
    assert.match(reason, /^link-politik: kundens egen side må ikke linkes \(/, `${url} gav: ${reason}`);
    assert.ok(reason.includes(url), `${url} skal nævnes i grunden: ${reason}`);
    // Uenigheden, der er væk: voice-guide-reglen ser den SAMME URL og ville have
    // rapporteret noget andet hvis den kom først.
    assert.match(voiceGateReason(d.body) ?? "", /^voice-guide: kunde-link: /);
  }
});

test("positiv kontrol: kinly.dk-links alene blokerer ikke", () => {
  assert.equal(draftGateReason(draft("Se https://kinly.dk/projekter/"), SENDER), null);
  assert.equal(validateDraft(body("Se https://kinly.dk/projekter/")).ok, true);
});

test("link-politik afgør før voice-guide når begge gælder", () => {
  const both = draft(`Se ${CUSTOMER_SITES.ktvvs}\nPrisen er 5.000 kr`);
  assert.match(draftGateReason(both, SENDER) ?? "", /^link-politik: /);
});

test("voice-guide alene giver uændret voice-guide-grund", () => {
  assert.match(draftGateReason(draft("Prisen er 5.000 kr"), SENDER) ?? "", /^voice-guide: pris\/penge/);
});

test("signatur-reglen er med i den fælles gate — for begge afsendere", () => {
  // "Med venlig hilsen" midt i teksten + den tilføjede signatur = to forekomster,
  // som sendeløkkens gamle hegn (uden om gaten) stoppede på mens preflighten
  // talte kladden som sendbar.
  const stablet = draft("Med venlig hilsen er mit bud.");
  assert.match(draftGateReason(stablet, SENDER) ?? "", /^signatur-fejl i body/);
  assert.equal(draftGateReason(stablet, SENDER), draftGateReason(stablet, "charlie"));
});

test("emne-gaten er stadig sidste led i rækkefølgen", () => {
  const d = draft("", `Tilbud — ${CUSTOMER_SITES.ktvvs}`);
  assert.match(draftGateReason(d, SENDER) ?? "", /^kunde-link i emne: /);
});

// ---- Demo-løftet i den fælles gate (27/9) ---------------------------------
// En ældre eller håndredigeret prospekt-krop kan love "et par demoer" som
// linkblokken ikke viser. Værnet bor i draftGateReason, så preflight (GET) og
// sendeløkke (POST) svarer præcis det samme om den samme krop. Syntetisk: hver
// kontrol bygger sin egen krop, så det er værnet der måles, ikke kladden.
const PROMISE = "Jeg har lavet et par demoer, se dem herunder.";
// Udkast-tilbuddet fra den deterministiske komponist: fremtid, ikke en påstand.
const OFFER = "Hvis I har lyst, laver jeg gerne et gratis udkast til hvordan en side for Test VVS ApS kunne se ud, så kan I vurdere idéen helt konkret.";
const MALER = "maler";
const MALER_NAME = "Maler Mikkelsen";
// Maler har hverken case eller branche-side: kun forside + demo-link.
const MALER_LINKS = referenceLines(MALER, MALER_NAME).map((l) => l.slice(2));

/** Krop med netop de linklinjer testen vil have, så værnet måles på kroppen alene. */
function bodyWith(branch: string, name: string, links: string[], extra = ""): string {
  return `Hej,\n\n${REFERENCE_INTRO}\n${links.map((u) => `→ ${u}`).join("\n")}\n${extra ? `${extra}\n` : ""}\nMed venlig hilsen\nLucas`;
}
const gated = (branch: string, name: string, links: string[], extra = ""): GateDraft =>
  ({ body: bodyWith(branch, name, links, extra), subject: `Tilbud til ${name}`, branch, name });

test("positiv kontrol for testene nedenfor: løftet fanges, linkene har en demo", () => {
  assert.equal(hasDemoPromise(PROMISE), true);
  assert.equal(hasDemoPromise(OFFER), false, "udkast-tilbuddet er fremtid, ikke et løfte");
  assert.equal(hasDemoLink(referenceLines(BRANCH, NAME)), false, "VVS viser ingen demo");
  assert.equal(hasDemoLink(referenceLines(MALER, MALER_NAME)), true, "maler viser en demo");
});

test("VVS med forside + case + branche-side og et demo-løfte blokeres", () => {
  const d = gated(BRANCH, NAME, referenceLines(BRANCH, NAME).map((l) => l.slice(2)), PROMISE);
  const reason = draftGateReason(d, SENDER);
  assert.match(reason ?? "", /^demo-løfte uden demo-link: /, String(reason));
  // Samme krop uden løftet er sendbar — grunden kommer fra løftet, ikke linkene.
  assert.equal(draftGateReason(gated(BRANCH, NAME, referenceLines(BRANCH, NAME).map((l) => l.slice(2))), SENDER), null);
});

test("maler med det faktiske demo-link tillades — og kun der", () => {
  const med = gated(MALER, MALER_NAME, MALER_LINKS, PROMISE);
  assert.ok(med.body.includes(DEMO_SITES.denlillemaler), med.body);
  assert.equal(draftGateReason(med, SENDER), null);
  // Kun forsiden i kroppen: link-kravet er opfyldt (maler har ingen case og
  // ingen branche-side), så kun demo-løfte-værnet kan stoppe kladden.
  const uden = gated(MALER, MALER_NAME, [KINLY_FRONT], PROMISE);
  assert.match(draftGateReason(uden, SENDER) ?? "", /^demo-løfte uden demo-link: /);
});

test("metadata tæller ikke som synligt demo-link i kroppen", () => {
  const medMeta: GateDraft & { demoPair: { url: string }[]; links: string[] } = {
    ...gated(MALER, MALER_NAME, [KINLY_FRONT], PROMISE),
    demoPair: [{ url: DEMO_SITES.denlillemaler }],
    links: [DEMO_SITES.denlillemaler],
  };
  assert.match(draftGateReason(medMeta, SENDER) ?? "", /^demo-løfte uden demo-link: /);
});

test("ærlige linklinjer og gratis-udkast-tilbuddet blokeres ikke", () => {
  for (const [branch, name, links] of [
    [BRANCH, NAME, referenceLines(BRANCH, NAME).map((l) => l.slice(2))],
    [MALER, MALER_NAME, MALER_LINKS],
  ] as [string, string, string[]][]) {
    const d = gated(branch, name, links, OFFER);
    assert.equal(hasDemoPromise(d.body), false, d.body);
    assert.equal(draftGateReason(d, SENDER), null, `${name}: ${draftGateReason(d, SENDER)}`);
  }
});

test("opfølgninger er undtaget — første trin i sekvensen er ikke", () => {
  const krop = (): string => bodyWith(BRANCH, NAME, referenceLines(BRANCH, NAME).map((l) => l.slice(2)), PROMISE);
  const followup: GateDraft = { body: krop(), subject: `Tilbud til ${NAME}`, branch: BRANCH, name: NAME, source: "opfoelgning", step: 2 };
  assert.equal(draftGateReason(followup, SENDER), null);
  const foersteTrin: GateDraft = { ...followup, step: 1 };
  assert.match(draftGateReason(foersteTrin, SENDER) ?? "", /^demo-løfte uden demo-link: /);
});

test("begge routes i send-ruten bruger den fælles gate — ingen egen rækkefølge", () => {
  // Kontrakten kan ikke ses i runtime uden at kalde POST (den sender rigtigt), så
  // den ses på kaldepladserne: GET (preflight) og POST (sendeløkken) skal BEGGE
  // gå gennem draftGateReason, og routen må ikke selv køre del-reglerne — det var
  // netop en sekundær rækkefølge (voice-guide og signatur-tjek før link-gaten) der
  // gav uenigheden.
  assert.equal((ROUTE_SRC.match(/draftGateReason\(/g) ?? []).length, 2, "GET og POST skal hver kalde draftGateReason");
  assert.doesNotMatch(ROUTE_SRC, /\bvalidateDraft\s*\(/);
  assert.doesNotMatch(ROUTE_SRC, /\b(linkGateReason|subjectGateReason|signatureGateReason)\s*\(/);
  assert.doesNotMatch(ROUTE_SRC, /Med venlig hilsen/, "signatur-reglen må ikke ligge i routen igen");
});

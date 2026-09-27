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

import { draftGateReason, validateDraft, voiceGateReason } from "./draft.ts";
import { CUSTOMER_SITES, REFERENCE_INTRO, referenceLines } from "./demos.ts";

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

import { test } from "node:test";
import assert from "node:assert/strict";
import { composeColdEmail, composeFollowupEmail } from "./compose.ts";
import { DEMO_SITES, KINLY_FRONT, referenceLines } from "./demos.ts";

// Bug fixed 2026-09-23: composeColdEmail (ingest-leadgen + VPS run.mjs path)
// greeted with the raw business name — "Hej Gitte Gylvig Skin & Welness,",
// "Hej Skagen Sundhedsklinik.dk,". Now: personal name only when one clearly
// leads the business name, else plain "Hej,".
test("composeColdEmail greeting — Gitte Gylvig Skin & Welness -> Hej Gitte,", () => {
  const c = composeColdEmail({ name: "Gitte Gylvig Skin & Welness", branch: "hudpleje", city: "Skagen", hooks: [] });
  assert.ok(c.text.startsWith("Hej Gitte,\n"), c.text.split("\n")[0]);
});

test("composeColdEmail greeting — Skagen Sundhedsklinik.dk -> Hej,", () => {
  const c = composeColdEmail({ name: "Skagen Sundhedsklinik.dk", branch: "sundhed", city: "Skagen", hooks: [] });
  assert.ok(c.text.startsWith("Hej,\n"), c.text.split("\n")[0]);
});

test("composeColdEmail greeting — Hos Anne Marie -> Hej Anne Marie,", () => {
  const c = composeColdEmail({ name: "Hos Anne Marie", branch: "frisør", city: "Herning", hooks: [] });
  assert.ok(c.text.startsWith("Hej Anne Marie,\n"), c.text.split("\n")[0]);
});

test("composeColdEmail greeting — Restaurant Klosterkroen -> Hej,", () => {
  const c = composeColdEmail({ name: "Restaurant Klosterkroen", branch: "restaurant", city: "Herning", hooks: [] });
  assert.ok(c.text.startsWith("Hej,\n"), c.text.split("\n")[0]);
});

// ---- Demo-løftet skal matche den genererede tekst (26/9) -------------------
// buildText satte altid mix.demoIntro + tailorLine på, også når pickDemos er
// tom (tømrer/vinduespudser). Så lovede mailen eksempler den ikke havde.
const PROMISE = /Jeg lavede et par demoer|Sådan kunne det fx se ud|Bedst hvis I selv kigger|Det er bare eksempler|Det er kun for at vise idéen/;
const linksIn = (text: string) => [...text.matchAll(/^→\s*(\S+)$/gm)].map((m) => m[1]);

test("composeColdEmail tømrer uden demo-par: ingen demo-løfte, kun forside", () => {
  const name = "Tømrer Hansen";
  const c = composeColdEmail({ name, branch: "tømrer", city: "Ikast", hooks: [] });
  assert.deepEqual(c.demoPair, []);
  assert.equal(PROMISE.test(c.text), false, c.text);
  assert.equal(PROMISE.test(c.html), false, c.html);
  assert.deepEqual(linksIn(c.text), referenceLines("tømrer", name).map((l) => l.slice(2)));
  assert.deepEqual(linksIn(c.text), ["https://kinly.dk/"]);
});

test("composeFollowupEmail vinduespudser uden demo-par: ingen demo-løfte", () => {
  const c = composeFollowupEmail({ name: "Polering Vest", branch: "vinduespudser", city: "Ikast", hooks: [] });
  assert.deepEqual(c.demoPair, []);
  assert.equal(PROMISE.test(c.text), false, c.text);
});

test("composeColdEmail og followup beholder demo-linjen for maler", () => {
  const name = "Maler Mikkelsen";
  for (const c of [
    composeColdEmail({ name, branch: "maler", city: "Herning", hooks: [] }),
    composeFollowupEmail({ name, branch: "maler", city: "Herning", hooks: [] }),
  ]) {
    assert.equal(PROMISE.test(c.text), true, c.text);
    assert.ok(linksIn(c.text).includes(DEMO_SITES.denlillemaler), c.text);
  }
});

// ---- Egen intro når forsiden er det ENESTE link (27/9) ---------------------
// Tømrer/vinduespudser har kun kinly.dk-forsiden i referenceLines (ingen case,
// ingen branche-side, intet demo-par). Uden intro stod en nøgen URL alene i
// mailen. Nu kommer introen fra referenceIntro (samme kilde som DM- og
// trin-vejen), og forside og tilbud er hver sit HTML-afsnit.
const HTML_P = /<p style="margin:0 0 14px;line-height:1.6">([\s\S]*?)<\/p>/g;
const htmlParas = (html: string) => [...html.matchAll(HTML_P)].map((m) => m[1]);
const textParas = (text: string) => text.split("\n\n");
const OWN_SITE_INTRO = "Her er min egen side.";
const OFFER_START = /^(Hvis I har lyst|Jeg kan også lave et gratis udkast)/;

test("tømrer/service: egen intro på forside-linket og eget afsnit til tilbuddet", () => {
  for (const [name, branch] of [["Tømrer Hansen", "tømrer"], ["Polering Vest", "vinduespudser"]]) {
    for (const [kind, c] of [
      ["cold", composeColdEmail({ name, branch, city: "Ikast", hooks: [] })],
      ["followup", composeFollowupEmail({ name, branch, city: "Ikast", hooks: [] })],
    ] as const) {
      const where = `${kind} ${name}`;
      // Intro + forside-link står i samme afsnit, intro-linjen først (og
      // tilbuddet står IKKE i det afsnit — derfor hele afsnittet, ikke bare linjen).
      const linkPara = textParas(c.text).find((p) => p.split("\n").some((l) => l.startsWith("→ ")));
      assert.equal(linkPara, `${OWN_SITE_INTRO}\n→ ${KINLY_FRONT}`, c.text);
      assert.deepEqual(linksIn(c.text), [KINLY_FRONT], where);
      assert.equal(PROMISE.test(c.text), false, where);
      const html = htmlParas(c.html);
      assert.ok(
        html.includes(`${OWN_SITE_INTRO}<br><a href="${KINLY_FRONT}" style="color:#3a6b4f">${KINLY_FRONT}</a>`),
        `intro og link er ikke samme HTML-afsnit i ${where}: ${JSON.stringify(html)}`,
      );
      // Tilbuddet (kun den kolde mail) har sit eget <p> — ikke klistret på linket.
      if (kind === "cold") {
        const offer = html.find((p) => OFFER_START.test(p));
        assert.ok(offer, `tilbuddet mangler sit eget afsnit i ${where}: ${JSON.stringify(html)}`);
        assert.ok(!offer!.includes("<a href"), `tilbud og link deler afsnit i ${where}: ${offer}`);
        assert.ok(textParas(c.text).some((p) => OFFER_START.test(p)), where);
      }
    }
  }
});

test("maler med rigtige eksempler beholder demo-introen — ikke forside-introen", () => {
  for (const c of [
    composeColdEmail({ name: "Maler Mikkelsen", branch: "maler", city: "Herning", hooks: [] }),
    composeFollowupEmail({ name: "Maler Mikkelsen", branch: "maler", city: "Herning", hooks: [] }),
  ]) {
    const introPara = textParas(c.text).find((p) => p.includes("→ ")) ?? "";
    assert.equal(PROMISE.test(introPara), true, c.text);
    assert.ok(!introPara.includes(OWN_SITE_INTRO), introPara);
    assert.ok(linksIn(c.text).length > 1, c.text);
  }
});

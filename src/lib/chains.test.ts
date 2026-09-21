import { test } from "node:test";
import assert from "node:assert/strict";
import { isChain, isAgency, chainNameKey, repeatedChainNames } from "./chains.ts";

test("kæder med mellemrum i navnet fanges (Profil Optik-hullet)", () => {
  assert.equal(isChain("Profil Optik Herning"), true);
  assert.equal(isChain("Profiloptik Ikast"), true);
  assert.equal(isChain("Louis Nielsen Horsens"), true);
});

test("mellemrums-passet limer ikke korte kædenavne sammen af nabo-ord", () => {
  // Kun kæde-navne på 10+ tegn testes uden mellemrum, så korte som "h&m",
  // "imerco" og "coop" kan ikke opstå ved at klistre to almindelige ord sammen.
  assert.equal(isChain("Frisør Anna"), false);
  assert.equal(isChain("Ho Ma Kro"), false);
  assert.equal(isChain("Café Co Op Stuen"), false);
  assert.equal(isChain("Ime R Co Malerfirma"), false);
});

test("chainNameKey normaliserer selskabsform og tegnsætning", () => {
  assert.equal(chainNameKey("Karger Beauty ApS"), "karger beauty");
  assert.equal(chainNameKey("Beauty by NK™"), "beauty by nk");
  assert.equal(chainNameKey("Lara  Beauty A/S"), "lara beauty");
});

test("samme navn i 3+ byer = kæde; 2 byer er ikke nok", () => {
  const repeats = repeatedChainNames([
    { name: "Pro Beauty", city: "Varde" },
    { name: "Pro Beauty ApS", city: "Galten" },
    { name: "Pro Beauty", city: "Esbjerg" },
    { name: "Svostrup Kro", city: "Silkeborg" },
    { name: "Svostrup Kro", city: "Svostrup" },
    { name: "Frisør Anna", city: "Herning" },
  ]);
  assert.ok(repeats.has("pro beauty"));
  assert.ok(!repeats.has("svostrup kro"), "to bystavemåder for samme kro er ikke en kæde");
  assert.ok(!repeats.has("frisør anna"));
});

test("samme navn 3 gange i SAMME by tæller ikke (dubletrækker)", () => {
  const repeats = repeatedChainNames([
    { name: "Restaurant Hos", city: "Odense" },
    { name: "Restaurant Hos", city: "Odense" },
    { name: "Restaurant Hos", city: "Odense" },
  ]);
  assert.equal(repeats.size, 0);
});

test("isAgency fanger bureauer og konkurrenter", () => {
  for (const n of ["Social Boost", "Nord Marketing ApS", "Buur Webdesign", "Mediebureauet Vest",
                   "Klar Kommunikationsbureau", "SEO Danmark", "Vi laver hjemmesider"]) {
    assert.equal(isAgency(n), true, n);
  }
});

test("isAgency rammer ikke rigtige forretninger", () => {
  // Løse ord som media/digital/studio/boost står bevidst IKKE i listen —
  // en falsk positiv koster et ægte lead.
  for (const n of ["Frisør Nasim", "Headquarter Barbershop", "Dangi Frisør", "Café Boost",
                   "Mediehuset Nord", "Studio Hud", "Salon Marketingvej 4", "Fotostudio Sea",
                   "Digital Print Randers"]) {
    assert.equal(isAgency(n), false, n);
  }
});

test("isAgency læser også branchen", () => {
  assert.equal(isAgency("Nord Consult", "Marketing"), true);
  assert.equal(isAgency("Nord Consult", "Revisor"), false);
});

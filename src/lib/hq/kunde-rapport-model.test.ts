import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { anmeldelsesIde, byggRapport, forrigeVindue, nyeSider, sideIdeFor, maanedFor, sprogFejl, tallene, ugeKlik, type GscInput, type Maaling } from "./kunde-rapport-model.ts";
import { renderKundeRapportHtml } from "./kunde-rapport-html.ts";

// Rigtige målinger fra kunde_seo_tjek.py, 28-09-2026 (fixtures/).
const fx = (n: string): Maaling => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures", `kunde-maaling-${n}.json`), "utf-8"));
const ikast = fx("ikast");
const vida = fx("vida");
const jb = fx("jbcafeen");

function gsc(dage = 90, slut = "2026-09-25"): GscInput {
  const end = Date.parse(`${slut}T12:00:00Z`);
  const daily = Array.from({ length: dage }, (_, i) => ({ date: new Date(end - (dage - 1 - i) * 86_400_000).toISOString().slice(0, 10), clicks: i < dage - 28 ? 2 : 4, impressions: 40 }));
  return { periodStart: daily[dage - 28].date, periodEnd: slut, clicks: 112, impressions: 1120, topQueries: [{ query: "autoværksted ikast", clicks: 9, impressions: 90, position: 3.4 }, { query: "nul klik", clicks: 0, impressions: 5, position: 30 }], daily };
}

test("ingen fagord eller tankestreg i nogen variant (Lucas' sprogregel)", () => {
  for (const [m, g] of [[ikast, gsc()], [ikast, null], [vida, null], [jb, null]] as const) {
    const r = byggRapport({ kunde: m.navn, maaling: m, forrige: null, gsc: g, arbejde: [] });
    assert.deepEqual(sprogFejl(r), [], `${m.url}: ${sprogFejl(r).join(" | ")}`);
    // Den renderede HTML må heller ikke have tankestreg i vores egen tekst (kundens citater i Google-kortet undtaget).
    const html = renderKundeRapportHtml({ ...r, googleKort: null });
    assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/, ""), /—|–/);
  }
});

test("variant vælges af om der er tal fra Google; uden adgang står der hvad adgang giver", () => {
  const a = byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: gsc(), arbejde: [] });
  assert.equal(a.variant, "med-adgang");
  assert.equal(a.hero.tal, "112");
  assert.ok(a.ugeKlik.length >= 12);
  assert.deepEqual(a.soegeord.map((q) => q.tekst), ["autoværksted ikast"], "søgeord uden besøg vises ikke");
  const b = byggRapport({ kunde: "VIDA", maaling: vida, forrige: null, gsc: null, arbejde: [] });
  assert.equal(b.variant, "uden-adgang");
  // Ingen karakterbog ("24 af 24"): alt i orden = "Alle", ellers antallet der er på plads.
  assert.equal(b.hero.tal, b.iOrden.ok === b.iOrden.ialt ? "Alle" : `${b.iOrden.ok}`);
  assert.ok(b.udenAdgang);
  assert.equal(a.udenAdgang, null);
});

test("første rapport er nulpunkt: ingen pile på sidens tal; Google-pilen kun når historikken dækker perioden", () => {
  const r = byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: gsc(), arbejde: [] });
  assert.equal(r.nulpunkt, true);
  assert.ok(r.nogletal.filter((n) => n.label !== "Vist i Google").every((n) => n.pil === undefined));
  assert.equal(r.hero.pil, "op");
  assert.equal(r.hero.foer, "56"); // 28 dage × 2 klik
  assert.match(r.nulpunktTekst ?? "", /Besøgene fra Google kan vi sammenligne/);
  // Kun 40 dages historik ⇒ ingen fuld periode før ⇒ ingen pil, og teksten lover ikke en.
  const kort = byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: gsc(40), arbejde: [] });
  assert.equal(kort.hero.pil, undefined);
  assert.match(kort.nulpunktTekst ?? "", /Fra næste måned viser pilene/);
});

test("anden måned: pile mod sidste sendte rapport, og det der blev rettet, står som arbejde", () => {
  const foer: Maaling = structuredClone(ikast);
  const nu: Maaling = structuredClone(ikast);
  nu.maalt = "2026-10-27T09:00:00+01:00";
  nu.punkter = nu.punkter.map((p) => (p.punkt === "billeder_alt" ? { ...p, status: "ok", vaerdi: "0 af 30 billeder mangler beskrivelse" } : p.punkt === "svartid" ? { ...p, vaerdi: "240 ms" } : p));
  nu.vigtigste = [];
  const r = byggRapport({ kunde: "Ikast", maaling: nu, forrige: foer, gsc: null, arbejde: ["Ny side om lånebil"] });
  assert.equal(r.nulpunkt, false);
  assert.equal(r.nulpunktTekst, null);
  assert.equal(r.maaned, "2026-10");
  assert.deepEqual(r.rettet, ["Billedbeskrivelser: Alle 30 billeder har en beskrivelse."]);
  const b = r.nogletal.find((n) => n.label === "Billeder uden beskrivelse")!;
  assert.deepEqual([b.pil, b.vurdering, b.foer], ["ned", "bedre", "18"]);
  const s = r.nogletal.find((n) => n.label === "Så hurtigt åbner siden")!;
  assert.deepEqual([s.pil, s.vurdering], ["op", "daarligere"]);
  assert.deepEqual(r.arbejde, ["Ny side om lånebil"]);
  assert.match(r.mail.emne, /fandt jer via Google/, "besøgstallet står i emnet, når vi har det");
  assert.match(r.mail.tekst, /fandt jer via Google de seneste fire uger/);
  // Det har vi lavet: rettet + Lucas' linje står i både rapport og mail (det er dét, 999 kr betaler for).
  assert.deepEqual(r.gjort.slice(0, 2), ["Billedbeskrivelser: Alle 30 billeder har en beskrivelse.", "Ny side om lånebil"]);
  assert.match(r.mail.tekst, /Det har vi lavet siden sidst:\n- Billedbeskrivelser/);
});

test("de vigtigste følger motorens rangering; færre end tre fyldes aldrig op", () => {
  const r = byggRapport({ kunde: "Jernbanecafeen", maaling: jb, forrige: null, gsc: null, arbejde: [] });
  assert.deepEqual(r.vigtigste.map((f) => f.titel), ["Google må vise siden", "Overskriften i Google", "Hovedoverskriften på forsiden"]);
  const ik = byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: null, arbejde: [] });
  assert.equal(ik.vigtigste.length, 1);
  assert.match(ik.vigtigsteNote, /Vi finder ikke på flere/);
  const vd = byggRapport({ kunde: "VIDA", maaling: vida, forrige: null, gsc: null, arbejde: [] });
  assert.equal(vd.vigtigste.length, 0);
});

test("det gode står først, medmindre noget haster; så står det øverst og siges lige ud", () => {
  const jbr = byggRapport({ kunde: "Jernbanecafeen", maaling: jb, forrige: null, gsc: null, arbejde: [], hilsen: "Niels" });
  assert.match(jbr.mail.tekst, /^Hej Niels\./);
  assert.equal(jbr.haster, true);
  assert.match(jbr.mail.emne, /allerede gang i/, "emnet må ikke lyde som en alarm");
  assert.match(jbr.mail.tekst, /Google om ikke at vise den.*med det samme/, "men selve mailen siger det lige ud");
  assert.ok(jbr.mail.tekst.indexOf("Det tager vi os af først") < jbr.mail.tekst.indexOf("Det gode:"), "det der haster må aldrig begraves under det gode");
  const ik = byggRapport({ kunde: "Ikast AutoService", maaling: ikast, forrige: null, gsc: null, arbejde: [] });
  assert.match(ik.mail.tekst, /^Hej Ikast AutoService\./);
  assert.equal(ik.haster, false);
  assert.ok(ik.godt.length >= 2);
  const godt = ik.mail.tekst.indexOf("Det går godt:");
  assert.ok(godt > 0 && godt < ik.mail.tekst.indexOf("kan blive endnu bedre"), "det gode skal stå før forbedringerne");
  // "Det har vi gjort" er aldrig tomt, heller ikke første måned uden ændringer.
  assert.ok(ik.gjort.length >= 1);
  assert.doesNotMatch(ik.gjort.join(" "), /ikke ændret/);
});

test("tal trækkes ud af motorens tekster; ikke-målte punkter giver ingen tal", () => {
  assert.deepEqual(tallene(ikast), { svartid: 123, sidestoerrelse: 50, ordtal: 1356, links: 16, billeder_uden: 18, billeder_ialt: 30, sitemap_sider: 16, brudte: 0, links_testet: 10 });
  const ekstern: Maaling = { ...ikast, punkter: ikast.punkter.map((p) => (p.punkt === "svartid" ? { ...p, vaerdi: "ikke målt direkte", status: "info" } : p)) };
  assert.equal(tallene(ekstern).svartid, undefined);
  const r = byggRapport({ kunde: "Ikast", maaling: ekstern, forrige: null, gsc: null, arbejde: [] });
  const linje = r.tjek.flatMap((g) => g.linjer).find((l) => l.navn === "Siden åbner hurtigt")!;
  assert.equal(linje.status, "ikke_maalt");
});

test("uger: kun hele uger; forrige periode kræver næsten fulde 28 dage", () => {
  const u = ugeKlik(gsc().daily);
  assert.ok(u.every((x) => x.klik > 0));
  assert.equal(u[u.length - 1].klik, 28, "sidste hele uge = 7 dage × 4 klik");
  assert.equal(forrigeVindue(gsc(40)), null);
  assert.deepEqual(forrigeVindue(gsc()), { klik: 56, visninger: 1120 });
});

test("måned følger dansk tid, ikke UTC", () => {
  assert.equal(maanedFor("2026-09-30T22:30:00Z"), "2026-10");
  assert.equal(maanedFor("2026-09-30T21:30:00Z"), "2026-09");
});

test("kontaktboks: Lucas' note escapes, uden note og uden `personlig` (ældre rapporter) virker også", () => {
  const r = byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: null, arbejde: [], note: "Vi har tjekket <script>alert(1)</script> for jer." });
  const med = renderKundeRapportHtml(r);
  assert.match(med, /Lucas Buur/);
  assert.match(med, /Vi har tjekket &lt;script&gt;alert\(1\)&lt;\/script&gt; for jer\./);
  assert.doesNotMatch(med, /<script>alert/);
  assert.ok(med.includes(r.personlig.afslutning));
  const uden = renderKundeRapportHtml(byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: null, arbejde: [] }));
  assert.match(uden, /Lucas Buur/);
  assert.doesNotMatch(uden, /<blockquote/);
  const gammel = { ...r, personlig: undefined } as unknown as typeof r;
  assert.match(renderKundeRapportHtml(gammel), /Lucas Buur/);
  // PDF'en (.tsx) kan node --test ikke indlæse; den tjekkes med tsx i et script.
});

test("vi står for siden: småfejl nævnes ikke for kunden, heller ikke som 'X af Y'", () => {
  const r = byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: null, arbejde: [], vedligeholder: true });
  assert.ok(r.iOrden.ok < 24, "fixturen har et åbent fund");
  assert.deepEqual(r.vigtigste, [], "ingen småfejl i kundens rapport");
  assert.equal(r.vigtigsteNote, "");
  assert.equal(r.iOrden.ialt, r.iOrden.ok, "bilaget tæller kun det viste");
  assert.ok(r.tjek.every((g) => g.linjer.every((l) => l.status === "ok")));
  assert.doesNotMatch(JSON.stringify(r), /billeder mangler|af 24/i);
  assert.match(r.mail.tekst, /retter småting/);
  assert.doesNotMatch(r.mail.tekst, /Alt, vi tjekker, var i orden/, "må ikke påstå alt var i orden");
  // Uden flaget: kunden ser fundet som før.
  const u = byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: null, arbejde: [] });
  assert.ok(u.vigtigste.length > 0);
});

test("rettet mellem månedens første måling og afsendelse står som 'rettet'", () => {
  const nu: Maaling = structuredClone(ikast);
  for (const p of nu.punkter) if (p.punkt === "billeder_alt") { p.status = "ok"; p.vaerdi = "30 af 30 billeder har en beskrivelse"; }
  nu.vigtigste = [];
  const r = byggRapport({ kunde: "Ikast", maaling: nu, forrige: null, foerstIMaaned: ikast, gsc: null, arbejde: [], vedligeholder: true });
  assert.ok(r.rettet.some((x) => x.startsWith("Billedbeskrivelser")), r.rettet.join(" | "));
  assert.ok(r.gjort[0].startsWith("Billedbeskrivelser"));
  assert.match(r.mail.tekst, /Det har vi lavet siden sidst:\n- Billedbeskrivelser/);
});

test("anmeldelser: glade kunder er et godt-kort; få anmeldelser bliver en idé vi kan hjælpe med", () => {
  const glad = byggRapport({ kunde: "VIDA", maaling: vida, forrige: null, gsc: null, arbejde: [], anmeldelser: { rating: 4.6, antal: 104 } });
  assert.ok(glad.godt.some((g) => g.titel === "Kunderne er glade" && /4,6 stjerner i snit fra 104/.test(g.tekst)));
  assert.equal(anmeldelsesIde({ rating: 4.6, antal: 104 }), null, "mange og gode: ingen idé");
  assert.match(anmeldelsesIde({ rating: 4.9, antal: 12 }) ?? "", /I har 12 anmeldelser med 4,9 stjerner i snit/);
  assert.match(anmeldelsesIde({ rating: 3.9, antal: 80 }) ?? "", /Svar på anmeldelserne/);
  assert.equal(anmeldelsesIde(null), null);
  const faa = byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: null, arbejde: [], vedligeholder: true, anmeldelser: { rating: 4.9, antal: 12 } });
  assert.match(faa.naesteGang[0], /^Flere anmeldelser på Google/);
  assert.deepEqual(sprogFejl(faa), []);
});

test("'det har vi gjort' er en kort oversigt i hverdagssprog, inkl. AI-søgning", () => {
  const r = byggRapport({ kunde: "Ikast", maaling: ikast, forrige: null, gsc: null, arbejde: [] });
  assert.ok(r.gjort.some((g) => /Google kan finde, læse og vise/.test(g)));
  assert.ok(r.gjort.some((g) => /AI som ChatGPT/.test(g)));
  assert.deepEqual(sprogFejl(r), []);
});

test("AI-nævninger: godt-kort og nøgletal når AI nævner kunden, idé når den sjældent gør", () => {
  const med = (naevnt: number): Maaling => ({ ...structuredClone(vida), ai_naevninger: { spurgt: 5, naevnt, tjekket: "2026-09-28T10:00:00+02:00", spoergsmaal: [{ q: "skønhedsklinik i Aalborg", naevnt: naevnt > 0 }] } });
  const god = byggRapport({ kunde: "VIDA", maaling: med(5), forrige: null, gsc: null, arbejde: [] });
  assert.ok(god.godt.some((g) => g.titel === "AI anbefaler jer" && /nævnt 5 af 5/.test(g.tekst)));
  assert.equal(god.nogletal.find((n) => n.label === "Nævnt når man spørger AI")?.vaerdi, "5 af 5");
  assert.ok(god.gjort.some((g) => /Spurgt AI 5 spørgsmål/.test(g)));
  assert.deepEqual(sprogFejl(god), []);
  const lav = byggRapport({ kunde: "VIDA", maaling: med(1), forrige: med(0), gsc: null, arbejde: [] });
  assert.match(lav.naesteGang[0], /^Bliv nævnt oftere/);
  assert.equal(lav.nogletal.find((x) => x.label === "Nævnt når man spørger AI")?.pil, undefined, "få spørgsmål = støj, ingen pil");
  const mange = (naevnt: number): Maaling => ({ ...med(naevnt), ai_naevninger: { ...med(naevnt).ai_naevninger!, spurgt: 10 } });
  const n = byggRapport({ kunde: "VIDA", maaling: mange(4), forrige: mange(1), gsc: null, arbejde: [] }).nogletal.find((x) => x.label === "Nævnt når man spørger AI");
  assert.equal(n?.pil, "op");
  assert.equal(n?.foer, "1 af 10");
  // Ikke målt = intet om AI (aldrig et gættet 0).
  const uden = byggRapport({ kunde: "VIDA", maaling: vida, forrige: null, gsc: null, arbejde: [] });
  assert.ok(!uden.nogletal.some((x) => x.label.includes("AI")));
});

test("salg uden pres: side-idé kun når vi ikke står for siden; maks fire idéer", () => {
  const faa: Maaling = { ...structuredClone(vida), sider_liste: [{ url: "https://x.dk/", titel: "" }, { url: "https://x.dk/kontakt", titel: "" }] };
  const fremmed = byggRapport({ kunde: "X", maaling: faa, forrige: null, gsc: null, arbejde: [], anmeldelser: { rating: 4.8, antal: 12 } });
  assert.ok(fremmed.naesteGang.some((t) => /^En side til hver ydelse: I har 2 sider/.test(t)));
  assert.ok(fremmed.naesteGang.some((t) => /I kan selv spørge glade kunder/.test(t)));
  assert.ok(fremmed.naesteGang.length <= 4);
  assert.deepEqual(sprogFejl(fremmed), []);
  const vores = byggRapport({ kunde: "X", maaling: faa, forrige: null, gsc: null, arbejde: [], vedligeholder: true });
  assert.ok(!vores.naesteGang.some((t) => /En side til hver ydelse/.test(t)));
  assert.equal(sideIdeFor(undefined), null);
});

test("nye sider siden sidste rapport står automatisk under 'Det har vi gjort'", () => {
  const side = (s: string, t = "") => ({ url: `https://vida-klinik.dk/${s}`, titel: t });
  const foer: Maaling = { ...structuredClone(vida), sider_liste: [side(""), side("priser")] };
  const nu: Maaling = { ...structuredClone(vida), maalt: "2026-10-28T06:00:00+01:00", sider_liste: [side(""), side("priser/"), side("hydrafacial", "Hydrafacial | VIDA"), side("fedtfrysning"), side("a"), side("b"), side("c")] };
  assert.deepEqual(nyeSider(nu, foer), ["Lavet 5 nye sider på jeres hjemmeside: Hydrafacial, Fedtfrysning, A, B og én mere."]);
  assert.deepEqual(nyeSider(nu, null), [], "første rapport ved ikke hvad der er nyt");
  assert.deepEqual(nyeSider(nu, vida), [], "forrige uden sideliste = intet");
  const r = byggRapport({ kunde: "VIDA", maaling: nu, forrige: foer, gsc: null, arbejde: [] });
  assert.match(r.gjort[0], /^Lavet 5 nye sider/);
  assert.match(r.mail.tekst, /- Lavet 5 nye sider/);
  assert.deepEqual(sprogFejl(r), []);
});

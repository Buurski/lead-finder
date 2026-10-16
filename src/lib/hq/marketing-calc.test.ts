import { test } from "node:test";
import assert from "node:assert/strict";
import { abBoard, abVerdict, funnel, measurePayload, mondayOf, median, savesSharesPer1000, slippedBefore, todayCph, weekGrid } from "./marketing-calc.ts";
import { approvalBlockers, hasPlaceholder, type MeasureDto, type RefDto } from "./marketing-types.ts";

const rep = (n: number, v: number) => Array.from({ length: n }, () => v);

test("median: tom, ulige, lige", () => {
  assert.equal(median([]), null);
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test("under 3 opslag pr. arm = for tidligt (grænsen 2 | 3)", () => {
  assert.equal(abVerdict(rep(2, 10), rep(9, 1)).verdict, "for-tidligt");
  assert.equal(abVerdict(rep(9, 1), rep(2, 10)).verdict, "for-tidligt");
  assert.equal(abVerdict([], []).verdict, "for-tidligt");
  assert.equal(abVerdict(rep(3, 10), rep(3, 5)).verdict, "signal");
});

test("3-4 opslag = signal, aldrig skær (grænsen 4 | 5)", () => {
  const four = abVerdict(rep(4, 10), rep(4, 1));
  assert.equal(four.verdict, "signal");
  assert.equal(four.ahead, "A");
  assert.equal(abVerdict(rep(5, 10), rep(4, 1)).verdict, "signal"); // kun den ene arm har 5
  assert.equal(abVerdict(rep(5, 10), rep(5, 1)).verdict, "skaer");
});

test("skær: præcis 25 % dårligere skærer, 24 % gør ikke", () => {
  assert.equal(abVerdict(rep(5, 100), rep(5, 75)).verdict, "skaer");
  assert.equal(abVerdict(rep(5, 100), rep(5, 76)).verdict, "signal");
  const r = abVerdict(rep(6, 60), rep(6, 100));
  assert.equal(r.verdict, "skaer");
  assert.equal(r.ahead, "B");
  assert.match(r.text, /Drop A/);
});

test("begge medianer 0 = ingen afgørelse; kun én på 0 er fuld forskel", () => {
  assert.equal(abVerdict(rep(5, 0), rep(5, 0)).verdict, "ingen-afgoerelse");
  assert.equal(abVerdict(rep(3, 0), rep(3, 0)).verdict, "ingen-afgoerelse");
  assert.equal(abVerdict(rep(5, 0), rep(5, 4)).verdict, "skaer");
  assert.equal(abVerdict(rep(3, 0), rep(3, 4)).verdict, "signal");
  // under 3 slår 0/0: for tidligt gælder først
  assert.equal(abVerdict(rep(2, 0), rep(2, 0)).verdict, "for-tidligt");
});

test("lige medianer er signal uden retning; medianen, ikke gennemsnittet, afgør", () => {
  const eq = abVerdict(rep(5, 7), rep(5, 7));
  assert.equal(eq.verdict, "signal");
  assert.equal(eq.ahead, null);
  // ét hit i A (outlier) flytter ikke medianen
  const r = abVerdict([1, 1, 1, 1, 500], [10, 10, 10, 10, 10]);
  assert.equal(r.medA, 1);
  assert.equal(r.verdict, "skaer");
  assert.equal(r.ahead, "B");
});

test("gem + delinger pr. 1000: kræver visninger, ellers null", () => {
  assert.equal(savesSharesPer1000({ views: 1000, saves: 20, shares: 10 }), 30);
  assert.equal(savesSharesPer1000({ views: 500, saves: 1, shares: null }), 2);
  assert.equal(savesSharesPer1000({ views: null, saves: 5, shares: 5 }), null);
  assert.equal(savesSharesPer1000({ views: 0, saves: 5, shares: 5 }), null);
  assert.equal(savesSharesPer1000({ views: 100, saves: null, shares: null }), null);
});

test("tragten: tom = null overalt, ikke 0; andel af forrige trin", () => {
  const none = funnel([]);
  assert.equal(none.posts, 0);
  assert.ok(none.steps.every((s) => s.value === null && s.ofPrev === null));
  const f = funnel([
    { views: 1000, saves: 20, shares: 10, profileVisits: 15, inquiries: null },
    { views: 500, saves: null, shares: 5, profileVisits: null, inquiries: 1 },
  ]);
  assert.equal(f.posts, 2);
  assert.deepEqual(f.steps.map((s) => s.value), [1500, 35, 15, 1]);
  assert.equal(f.steps[1].ofPrev, 2.3);
  assert.equal(f.steps[0].ofPrev, null);
});

test("kalender: mandag-til-søndag, uger over månedsskifte, dansk dato", () => {
  assert.equal(mondayOf("2026-10-15"), "2026-10-12"); // torsdag
  assert.equal(mondayOf("2026-10-12"), "2026-10-12"); // mandag
  assert.equal(mondayOf("2026-10-18"), "2026-10-12"); // søndag
  const g = weekGrid("2026-10-15", 2);
  assert.equal(g.length, 2);
  assert.deepEqual(g[0].slice(0, 2), ["2026-10-12", "2026-10-13"]);
  assert.equal(g[1][6], "2026-10-25");
  assert.equal(weekGrid("2026-10-30", 1)[0][6], "2026-11-01");
  // 22:30 UTC er allerede næste dag i København (sommertid, UTC+2)
  assert.equal(todayCph(new Date("2026-07-01T22:30:00Z")), "2026-07-02");
});

test("godkendelses-regler er de samme i UI og server", () => {
  assert.equal(hasPlaceholder("Dag [N] af at bygge Kinly"), true);
  assert.equal(hasPlaceholder("7 ting din forside skal have"), false);
  const base = { hook: "x", track: "faceless", charlieOk: false, customerCase: false, customerOk: false, musicKind: "ingen", musicLicense: "", trueCheckedOn: "2026-10-15" } as const;
  assert.deepEqual(approvalBlockers(base), []);
  assert.equal(approvalBlockers({ ...base, track: "duo" }).length, 1);
  assert.equal(approvalBlockers({ ...base, musicKind: "licenseret", musicLicense: "ukendt" }).length, 1);
  assert.equal(approvalBlockers({ ...base, musicKind: "licenseret", musicLicense: "erhverv-ok" }).length, 0);
  assert.equal(approvalBlockers({ ...base, musicKind: "original-lyd" }).length, 0);
});

test("sandt-dato er en godkendelses-blocker", () => {
  const base = { hook: "x", track: "faceless", charlieOk: false, customerCase: false, customerOk: false, musicKind: "ingen", musicLicense: "", trueCheckedOn: null } as const;
  assert.equal(approvalBlockers(base).length, 1);
  assert.match(approvalBlockers(base)[0], /Sandt i dag/);
  assert.equal(approvalBlockers({ ...base, trueCheckedOn: "2026-10-15" }).length, 0);
});

test("maaling-payload: tal bliver tal, tomme felter udelades, tekst forbliver tekst", () => {
  const p = measurePayload({ postedOn: "2026-10-16", views: "1000", skipPct: "42.5", postUrl: "https://x.dk/a", saves: "", note: "hej" });
  assert.deepEqual(p, { postedOn: "2026-10-16", views: 1000, skipPct: 42.5, postUrl: "https://x.dk/a", note: "hej" });
  assert.equal(typeof p.views, "number");
});

test("kalender: 'foer denne uge' viser aldrig postet eller droppet", () => {
  const rows = [
    { status: "godkendt", plannedFor: "2026-10-05" },
    { status: "postet", plannedFor: "2026-10-05" },
    { status: "droppet", plannedFor: "2026-10-05" },
    { status: "kladde", plannedFor: "2026-10-09" },
    { status: "godkendt", plannedFor: "2026-10-12" },
    { status: "godkendt", plannedFor: null },
  ];
  assert.deepEqual(slippedBefore(rows, "2026-10-12").map((r) => r.status + r.plannedFor), ["godkendt2026-10-05", "kladde2026-10-09"]);
});

test("A/B: dommen bruger testens primære metrik, ikke altid gem + delinger (Sol 16/10)", () => {
  const ab = (metric: string) => ({ id: "t1", data: { metric } }) as unknown as RefDto;
  // AB-03-scenariet: A har mange kommentarer, B mange gem. Kommentar-testen må ikke dømmes på gem.
  const ms = (arm: "A" | "B", kom: number, saves: number) =>
    rep(5, 0).map(() => ({ abId: "t1", arm, views: 1000, saves, shares: 0, newFollowers: null, note: `kom=${kom}` }) as unknown as MeasureDto);
  const measures = [...ms("A", 100, 10), ...ms("B", 10, 20)];
  const kom = abBoard([ab("Kommentarer pr. 1000 visninger (skriv `kom=N` i `note`)")], measures)[0].call;
  assert.equal(kom.verdict, "skaer");
  assert.equal(kom.ahead, "A");
  assert.equal(abBoard([ab("Gem + delinger pr. 1000")], measures)[0].call.ahead, "B");
  // Ukendt metrik: ingen automatisk dom.
  const ukendt = abBoard([ab("Stemning i kommentarfeltet")], measures)[0].call;
  assert.equal(ukendt.verdict, "ingen-afgoerelse");
  assert.equal(ukendt.ahead, null);
});

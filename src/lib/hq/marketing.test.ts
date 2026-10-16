import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import {
  abBoard, addInspiration, addMeasure, approvalBlockers, createAb, createDraft, createDraftFromHook, draftAction, listDrafts,
  listMeasures, listRefs, setAbStatus, setChecks, updateDraft,
} from "./marketing.ts";
import { EXPLAIN, TRACK_NOTE, approvalIssues, fillPlaceholders, findDraftByHook, hasPlaceholder, mentionsCustomer, placeholders } from "./marketing-types.ts";
import { marketingDraft } from "../db/schema.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const ok = { title: "7 ting en forside skal have", hook: "7 ting din forside skal have." };
const DAY = "2026-10-15";
/** Ny kladde, hvor "sandt i dag" er tjekket (ellers kan den ikke godkendes). */
const checked = async (extra: Record<string, unknown> = {}) => {
  const d = await createDraft(db, { ...ok, ...extra }, "lucas");
  return setChecks(db, d.id, { trueCheckedOn: DAY }, "lucas");
};

test("ny kladde starter altid som kladde, spor faceless er standard", async () => {
  const d = await createDraft(db, ok, "lucas");
  assert.equal(d.status, "kladde");
  assert.equal(d.track, "faceless");
  assert.equal(d.priority, 2);
  assert.equal(d.source, "manuel");
  assert.equal((await listDrafts(db)).length, 1);
});

test("agent-oprettelse: kun indhold, aldrig status/prioritet/godkendelser", async () => {
  const d = await createDraft(db, ok, "hermes", "agent");
  assert.equal(d.source, "agent");
  for (const key of ["status", "priority", "plannedFor", "charlieOk", "customerOk", "trueCheckedOn", "musicLicense", "customerCase"]) {
    await assert.rejects(createDraft(db, { ...ok, [key]: key === "status" ? "godkendt" : 1 }, "hermes", "agent"), /kendes ikke/, key);
  }
  assert.equal((await listDrafts(db)).length, 1);
  // agentens kladde er kun en kundecase, når teksten nævner en kunde (kundens ok sættes af et menneske); aldrig en licens
  assert.equal(d.customerCase, false);
  assert.equal(d.musicLicense, "");
});

test("kundecase: kun sand når kladden nævner en kunde (agent og menneske)", async () => {
  assert.equal((await createDraft(db, ok, "hermes", "agent")).customerCase, false);
  assert.equal((await createDraft(db, { title: "Sådan så VIDA ud før og efter", hook: "Før og efter." }, "hermes", "agent")).customerCase, true);
  assert.equal((await createDraft(db, { title: "x", hook: "Jernbanecaféen har fået ny side." }, "hermes", "agent")).customerCase, true);
  assert.equal((await createDraft(db, { title: "x", hook: "Dag 3 med evidans." }, "hermes", "agent")).customerCase, false); // hele ord: "evidans" er ikke VIDA
  assert.equal((await createDraft(db, ok, "lucas")).customerCase, false);
  assert.equal((await createDraft(db, { ...ok, customerCase: true }, "lucas")).customerCase, true); // menneskets eget valg vinder
  assert.equal((await createDraft(db, { title: "VIDA", hook: "x", customerCase: false }, "lucas")).customerCase, false);
  assert.equal(mentionsCustomer("ikastautoservice.dk"), true);
  assert.equal(mentionsCustomer("vida-klinik.dk"), true);
  assert.equal(mentionsCustomer("En almindelig hook uden kunder."), false);
});

test("kundecase: begynder en rettet tekst at nævne en kunde, bliver den en kundecase", async () => {
  const d = await createDraft(db, ok, "lucas");
  assert.equal(d.customerCase, false);
  assert.equal((await updateDraft(db, d.id, { hook: "Se hvad vi byggede til Ikast AutoService." }, "lucas")).customerCase, true);
  // et menneske der har sagt "ikke en kundecase" bliver ikke overrulet, når teksten rettes igen
  await setChecks(db, d.id, { customerCase: false }, "lucas");
  assert.equal((await updateDraft(db, d.id, { hook: "Se hvad vi byggede til Ikast AutoService. Igen." }, "lucas")).customerCase, false);
});

test("'Ikke en kundecase' nulstiller ikke de andre tjek", async () => {
  const d = await createDraft(db, { title: "Case", hook: "VIDA før og efter.", track: "duo" }, "hermes", "agent");
  assert.equal(d.customerCase, true);
  await setChecks(db, d.id, { charlieOk: true, customerOk: true, trueCheckedOn: DAY }, "lucas");
  const after = await setChecks(db, d.id, { customerCase: false }, "lucas");
  assert.equal(after.customerCase, false);
  assert.equal(after.charlieOk, true);
  assert.equal(after.customerOk, true);
  assert.equal(after.trueCheckedOn, DAY);
  // og på en godkendt kladde ændrer det hverken status eller de andre tjek
  assert.equal((await draftAction(db, d.id, "approve", "lucas")).status, "godkendt");
  const still = await setChecks(db, d.id, { customerCase: false }, "lucas");
  assert.equal(still.status, "godkendt");
  assert.equal(still.trueCheckedOn, DAY);
  // omvendt: kundecase tilbage uden kundens ok sender en godkendt kladde tilbage
  await setChecks(db, d.id, { customerOk: false }, "lucas");
  assert.equal((await setChecks(db, d.id, { customerCase: true }, "lucas")).status, "kladde");
});

test("hooks: 'lav kladde' laver ingen dublet, men returnerer den eksisterende (også en droppet)", async () => {
  const first = await createDraftFromHook(db, { title: "Gem den her", hook: "7 ting din forside skal have.", track: "faceless" }, "lucas");
  assert.equal(first.existing, false);
  const again = await createDraftFromHook(db, { title: "Gem den her", hook: "  \"7 ting din forside skal have\" ", track: "faceless" }, "charlie");
  assert.equal(again.existing, true);
  assert.equal(again.draft.id, first.draft.id);
  assert.equal((await listDrafts(db)).length, 1);
  await draftAction(db, first.draft.id, "drop", "lucas");
  const dropped = await createDraftFromHook(db, { title: "x", hook: "7 ting din forside skal have." }, "lucas");
  assert.equal(dropped.existing, true);
  assert.equal(dropped.draft.status, "droppet");
  assert.equal((await listDrafts(db)).length, 1);
  assert.equal((await createDraftFromHook(db, { title: "x", hook: "Noget helt andet." }, "lucas")).existing, false);
  assert.equal((await listDrafts(db)).length, 2);
  assert.equal(findDraftByHook([{ hook: "Dag 4 af at bygge Kinly." }], "dag 4 af at bygge kinly")?.hook, "Dag 4 af at bygge Kinly.");
  assert.equal(findDraftByHook([{ hook: "Dag 4 af at bygge Kinly." }], "Dag 5 af at bygge Kinly."), undefined);
  assert.equal(findDraftByHook([{ hook: "" }], ""), undefined);
});

test("pladsholder: tallet sættes ind i hooket; uudfyldte bliver stående", () => {
  assert.deepEqual(placeholders("Efter [N] rettelser og [målt tal] sekunder."), ["[N]", "[målt tal]"]);
  assert.equal(fillPlaceholders("Efter [N] rettelser.", ["12"]), "Efter 12 rettelser.");
  assert.equal(fillPlaceholders("Efter [N] rettelser og [M] sekunder.", ["12", ""]), "Efter 12 rettelser og [M] sekunder.");
  assert.equal(hasPlaceholder(fillPlaceholders("Efter [N] rettelser.", ["12"])), false);
  const keys = approvalIssues({ hook: "Dag [N]", track: "duo", charlieOk: false, customerCase: true, customerOk: false, musicKind: "licenseret", musicLicense: "ukendt", trueCheckedOn: null }).map((i) => i.key);
  assert.deepEqual(keys, ["placeholder", "charlie", "customer", "true", "license"]);
});

test("postet: linket til opslaget gemmes, tjekkes og kan tilføjes bagefter", async () => {
  const d = await checked();
  await draftAction(db, d.id, "approve", "lucas");
  await assert.rejects(draftAction(db, d.id, "posted", "lucas", { postUrl: "javascript:alert(1)" }), /http/);
  assert.equal((await listDrafts(db))[0].status, "godkendt"); // fejlen rullede alt tilbage
  const posted = await draftAction(db, d.id, "posted", "lucas", { postUrl: "https://www.instagram.com/reel/abc/" });
  assert.equal(posted.status, "postet");
  assert.equal(posted.postUrl, "https://www.instagram.com/reel/abc/");

  const e = await checked();
  await draftAction(db, e.id, "approve", "lucas");
  const noLink = await draftAction(db, e.id, "posted", "lucas");
  assert.equal(noLink.postUrl, "");
  assert.equal((await updateDraft(db, e.id, { postUrl: "https://www.tiktok.com/@kinly/video/1" }, "lucas")).postUrl, "https://www.tiktok.com/@kinly/video/1");
  assert.equal((await updateDraft(db, e.id, { title: "Ny titel" }, "lucas")).status, "postet"); // linket ændrer ikke status
});

test("forklaringer: ingen intern jargon i teksterne", () => {
  for (const t of Object.values(EXPLAIN)) assert.doesNotMatch(t, /\d{1,2}\/\d{1,2}|W\d|—/);
  for (const t of Object.values(TRACK_NOTE)) assert.doesNotMatch(t, /\d{1,2}\/\d{1,2}|valgt/i);
});

test("godkend kraever hook uden pladsholder", async () => {
  const empty = await createDraft(db, { title: "x" }, "lucas");
  await assert.rejects(draftAction(db, empty.id, "approve", "lucas"), /Hooket mangler/);
  const ph = await createDraft(db, { title: "x", hook: "Dag [N] af at bygge Kinly." }, "lucas");
  await assert.rejects(draftAction(db, ph.id, "approve", "lucas"), /pladsholder/);
  const good = await checked();
  assert.equal((await draftAction(db, good.id, "approve", "lucas")).status, "godkendt");
});

test("godkend kraever 'sandt pr. dato' (Lucas 15/10)", async () => {
  const d = await createDraft(db, ok, "lucas");
  await assert.rejects(draftAction(db, d.id, "approve", "lucas"), /Sandt i dag/);
  await setChecks(db, d.id, { trueCheckedOn: DAY }, "lucas");
  assert.equal((await draftAction(db, d.id, "approve", "lucas")).status, "godkendt");
});

test("duo kraever Charlies ja; kundecase kraever kundens ok", async () => {
  const duo = await checked({ track: "duo" });
  await assert.rejects(draftAction(db, duo.id, "approve", "lucas"), /Charlie/);
  await setChecks(db, duo.id, { charlieOk: true }, "lucas");
  assert.equal((await draftAction(db, duo.id, "approve", "lucas")).status, "godkendt");

  const kc = await checked({ customerCase: true });
  await assert.rejects(draftAction(db, kc.id, "approve", "lucas"), /Kundens/);
  await setChecks(db, kc.id, { customerOk: true, trueCheckedOn: "2026-10-15" }, "lucas");
  const done = await draftAction(db, kc.id, "approve", "lucas");
  assert.equal(done.status, "godkendt");
  assert.equal(done.trueCheckedOn, "2026-10-15");
});

test("musik: trending findes ikke; licenseret kraever erhverv-ok; original lyd er gyldig", async () => {
  await assert.rejects(createDraft(db, { ...ok, musicKind: "trending" }, "lucas"), /Trending lyd/);
  const lic = await checked({ musicKind: "licenseret", musicLicense: "ukendt" });
  await assert.rejects(draftAction(db, lic.id, "approve", "lucas"), /erhverv-ok/);
  await updateDraft(db, lic.id, { musicLicense: "erhverv-ok" }, "lucas");
  assert.equal((await draftAction(db, lic.id, "approve", "lucas")).status, "godkendt");
  const orig = await checked({ musicKind: "original-lyd" });
  assert.equal((await draftAction(db, orig.id, "approve", "lucas")).status, "godkendt");
  assert.deepEqual(approvalBlockers({ hook: "x", track: "faceless", charlieOk: false, customerCase: false, customerOk: false, musicKind: "ingen", musicLicense: "", trueCheckedOn: DAY }), []);
});

test("drop er en status og kan fortrydes; postet kraever godkendt; postet kan ikke droppes", async () => {
  const d = await checked();
  await assert.rejects(draftAction(db, d.id, "posted", "lucas"), /godkendt/);
  assert.equal((await draftAction(db, d.id, "drop", "lucas")).status, "droppet");
  assert.equal((await listDrafts(db)).length, 1); // intet slettet
  assert.equal((await draftAction(db, d.id, "restore", "lucas")).status, "kladde");
  await draftAction(db, d.id, "approve", "lucas");
  assert.equal((await draftAction(db, d.id, "posted", "lucas")).status, "postet");
  await assert.rejects(draftAction(db, d.id, "drop", "lucas"), /postet/);
});

test("ret: aendret indhold sender en godkendt kladde tilbage; uaendret indhold og prioritet goer ikke", async () => {
  const d = await checked();
  await draftAction(db, d.id, "approve", "lucas");
  const same = await updateDraft(db, d.id, { title: ok.title, hook: ok.hook, priority: 1, plannedFor: "2026-10-20" }, "lucas");
  assert.equal(same.status, "godkendt");
  assert.equal(same.priority, 1);
  assert.equal(same.plannedFor, "2026-10-20");
  const changed = await updateDraft(db, d.id, { hook: "Nyt hook." }, "lucas");
  assert.equal(changed.status, "kladde");
  await assert.rejects(updateDraft(db, d.id, { priority: 4 }, "lucas"), /priority/);
  await assert.rejects(updateDraft(db, d.id, { plannedFor: "i morgen" }, "lucas"), /dato/);
});

test("maaling: tomme felter bliver null, ikke 0; A/B kraever en test", async () => {
  const m = await addMeasure(db, { postedOn: "2026-10-16", views: 1200, saves: 30 }, "lucas");
  assert.equal(m.views, 1200);
  assert.equal(m.shares, null);
  assert.equal(m.inquiries, null);
  await assert.rejects(addMeasure(db, { postedOn: "2026-10-16", arm: "A" }, "lucas"), /koblet til en test/);
  await assert.rejects(addMeasure(db, { postedOn: "16/10", views: 1 }, "lucas"), /dato/);
  await assert.rejects(addMeasure(db, { postedOn: "2026-10-16", views: -1 }, "lucas"), /views/);
  assert.equal((await listMeasures(db)).length, 1);
});

test("A/B: dom regnes fra maalinger pr. arm; opslag uden visninger taeller ikke", async () => {
  const t = await createAb(db, { title: "Gem mod Send", armA: "Gem den her", armB: "Send den her" }, "lucas");
  assert.equal(t.status, "planlagt");
  assert.equal((await setAbStatus(db, t.id, "kører")).status, "kører");
  for (const [arm, saves] of [["A", 10], ["A", 12], ["B", 20], ["B", 22], ["B", 25]] as const) {
    await addMeasure(db, { postedOn: "2026-10-16", abId: t.id, arm, views: 1000, saves }, "lucas");
  }
  await addMeasure(db, { postedOn: "2026-10-16", abId: t.id, arm: "A", saves: 99 }, "lucas"); // ingen visninger
  const [item] = abBoard(await listRefs(db, "ab"), await listMeasures(db));
  assert.equal(item.values.A.length, 2);
  assert.equal(item.values.B.length, 3);
  assert.equal(item.call.verdict, "for-tidligt");
  for (const saves of [11, 13]) await addMeasure(db, { postedOn: "2026-10-17", abId: t.id, arm: "A", views: 1000, saves }, "lucas");
  const [again] = abBoard(await listRefs(db, "ab"), await listMeasures(db));
  assert.equal(again.call.verdict, "signal");
  assert.equal(again.call.ahead, "B");
});

test("inspiration: kun http(s)-adresser", async () => {
  const r = await addInspiration(db, { title: "Et godt opslag", url: "https://example.com/a", why: "Ren tekst foerst" }, "charlie");
  assert.equal(r.data.group, "link");
  await assert.rejects(addInspiration(db, { title: "x", url: "javascript:alert(1)" }, "charlie"), /http/);
});

test("maaling: tal som tekst fra en formular accepteres; 'abc', negative og NaN afvises", async () => {
  const m = await addMeasure(db, { postedOn: "2026-10-16", views: "1000", saves: "30", skipPct: "42.5", watchS: "7" }, "lucas");
  assert.equal(m.views, 1000);
  assert.equal(m.saves, 30);
  assert.equal(m.skipPct, 42.5);
  assert.equal(m.watchS, 7);
  assert.equal(m.shares, null);
  await assert.rejects(addMeasure(db, { postedOn: "2026-10-16", views: "abc" }, "lucas"), /views/);
  await assert.rejects(addMeasure(db, { postedOn: "2026-10-16", views: "-5" }, "lucas"), /views/);
  await assert.rejects(addMeasure(db, { postedOn: "2026-10-16", skipPct: "NaN" }, "lucas"), /skipPct/);
  await assert.rejects(addMeasure(db, { postedOn: "2026-10-16", views: "1.5" }, "lucas"), /helt tal/);
  assert.equal((await listMeasures(db)).length, 1);
});

test("ret: nyt indhold paa en godkendt kladde nulstiller Charlies ja, kundens ok og sandt-dato", async () => {
  const d = await checked({ track: "duo", customerCase: true });
  await setChecks(db, d.id, { charlieOk: true, customerOk: true }, "lucas");
  await draftAction(db, d.id, "approve", "lucas");
  const r = await updateDraft(db, d.id, { hook: "Et helt andet hook." }, "lucas");
  assert.equal(r.status, "kladde");
  assert.equal(r.charlieOk, false);
  assert.equal(r.customerOk, false);
  assert.equal(r.trueCheckedOn, null);
  // kun prioritet: ingen nulstilling
  const e = await checked({ track: "duo" });
  await setChecks(db, e.id, { charlieOk: true }, "lucas");
  await draftAction(db, e.id, "approve", "lucas");
  const same = await updateDraft(db, e.id, { priority: 1 }, "lucas");
  assert.equal(same.status, "godkendt");
  assert.equal(same.charlieOk, true);
  assert.equal(same.trueCheckedOn, DAY);
});

test("tjek fjernet paa godkendt kladde sender den tilbage til kladde; postet kraever tom blocker-liste", async () => {
  const d = await checked({ track: "duo" });
  await setChecks(db, d.id, { charlieOk: true }, "lucas");
  await draftAction(db, d.id, "approve", "lucas");
  assert.equal((await setChecks(db, d.id, { customerOk: true }, "lucas")).status, "godkendt"); // et ok mere ændrer intet
  assert.equal((await setChecks(db, d.id, { charlieOk: false }, "lucas")).status, "kladde");
  await setChecks(db, d.id, { charlieOk: true }, "lucas");
  await draftAction(db, d.id, "approve", "lucas");
  assert.equal((await setChecks(db, d.id, { trueCheckedOn: null }, "lucas")).status, "kladde");

  // en godkendt række, hvor tjekket mangler (rørt direkte i databasen), kan ikke markeres postet
  const p = await checked();
  await draftAction(db, p.id, "approve", "lucas");
  await db.update(marketingDraft).set({ trueCheckedOn: null });
  await assert.rejects(draftAction(db, p.id, "posted", "lucas"), /Kan ikke markeres som postet/);
});

test("laas: to samtidige godkendelser af samme kladde, kun den ene lykkes", async () => {
  const d = await checked();
  const res = await Promise.allSettled([draftAction(db, d.id, "approve", "lucas"), draftAction(db, d.id, "approve", "charlie")]);
  assert.equal(res.filter((r) => r.status === "fulfilled").length, 1);
  const lost = res.find((r) => r.status === "rejected") as PromiseRejectedResult;
  // Rækkelåsen serialiserer: nummer to ser den godkendte version og får en præcis besked frem for en generisk konflikt.
  assert.match(String(lost.reason), /Kun en kladde kan godkendes/);
  assert.equal((await listDrafts(db))[0].status, "godkendt");
});

test("godkend og ret samtidig: kladden bliver aldrig godkendt med indhold, godkendelsen ikke tjekkede (Sol 16/10)", async () => {
  const d = await checked();
  // Ret starter først; godkend i samme tick. Uden rækkelås læste godkend det gamle hook og godkendte det nye.
  const [ret, godkend] = await Promise.allSettled([
    updateDraft(db, d.id, { hook: "Dag [N] af at bygge Kinly." }, "charlie"),
    draftAction(db, d.id, "approve", "lucas"),
  ]);
  assert.equal(ret.status, "fulfilled");
  assert.equal(godkend.status, "rejected");
  const [row] = await db.select().from(marketingDraft);
  assert.equal(row.status, "kladde");
  assert.match(row.hook, /\[N\]/);
});

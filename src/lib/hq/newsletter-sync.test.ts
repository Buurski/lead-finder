import { test } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import { company, newsletterSnapshot } from "../db/schema.ts";
import { latestNewsletterFor, syncNewsletters } from "./newsletter-sync.ts";

const payload = {
  generatedAt: "2026-09-25T05:00:00Z",
  lists: [{ id: 3, name: "Kunder", subscribers: 1558 }],
  campaigns: [{ id: 12, name: "[service] Mail1 navneskift batch 1", type: "service", status: "draft", sentAt: null, scheduledAt: null, recipients: 0, opens: 0, clicks: 0, unsubscribes: 0, hardBounces: 0, softBounces: 0, complaints: 0 }],
  domain: { name: "ikastautoservice.dk", authenticated: true, dkim: true, dmarc: true },
};

test("sync: henter med Bearer-token, gemmer aggregater på kunden fundet via website-host", async () => {
  const db = await freshTestDb();
  const [ikast] = await db.insert(company).values({ rowNo: 1, name: "Ikast AutoService", website: "https://www.ikastautoservice.dk/", clientNo: 5 }).returning({ id: company.id });
  const calls: { url: string; auth: string | null }[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as unknown as typeof fetch;
  const r = await syncNewsletters(db, { fetch: fakeFetch, env: { NYHEDSBREV_TOKEN_IKAST: "tok" } });
  assert.deepEqual(r, [{ account: "ikast", ok: true }]);
  assert.equal(calls[0].auth, "Bearer tok");
  const [snap] = await latestNewsletterFor(db, ikast.id);
  assert.equal(snap.lists[0].subscribers, 1558);
  assert.equal(snap.campaigns[0].type, "service");
});

test("sync: uden token springes over; payload med persondata afvises og gemmes ikke", async () => {
  const db = await freshTestDb();
  assert.deepEqual(await syncNewsletters(db, { env: {} }), [{ account: "ikast", ok: false, error: "token ikke sat" }]);
  const leaky = (async () => new Response(JSON.stringify({ ...payload, contacts: [{ email: "a@b.dk" }] }), { status: 200 })) as unknown as typeof fetch;
  const r = await syncNewsletters(db, { fetch: leaky, env: { NYHEDSBREV_TOKEN_IKAST: "tok" } });
  assert.equal(r[0].ok, false);
  assert.match(r[0].error ?? "", /ukendt felt/);
  assert.equal((await db.select().from(newsletterSnapshot)).length, 0);
});

test("sync: for stort svar afvises før JSON-parsning; kildens tidsstempel gemmes (Sol w4a-r3 R3-05/06)", async () => {
  const db = await freshTestDb();
  await db.insert(company).values({ rowNo: 1, name: "Ikast AutoService", website: "https://www.ikastautoservice.dk/", clientNo: 5 });
  const huge = (async () => new Response("x".repeat(1_100_000), { status: 200 })) as unknown as typeof fetch;
  const r = await syncNewsletters(db, { fetch: huge, env: { NYHEDSBREV_TOKEN_IKAST: "tok" } });
  assert.match(r[0].error ?? "", /for stort/);
  const ok = (async () => new Response(JSON.stringify(payload), { status: 200 })) as unknown as typeof fetch;
  await syncNewsletters(db, { fetch: ok, env: { NYHEDSBREV_TOKEN_IKAST: "tok" } });
  const [snap] = await db.select().from(newsletterSnapshot);
  assert.equal(snap.generatedAt?.toISOString(), "2026-09-25T05:00:00.000Z");
});

test("audienceHistory: sidste måling pr. dansk dag, kun modtagerlister", async () => {
  const { audienceHistory } = await import("./newsletter-sync.ts");
  const L = (n: number) => [{ id: 1, name: "Nyhedsbrev", subscribers: n }, { id: 2, name: "Import batch 2", subscribers: 2 }];
  const h = audienceHistory([
    { takenAt: new Date("2026-09-24T22:30:00Z"), lists: L(10) }, // 00:30 25/9 i DK
    { takenAt: new Date("2026-09-25T05:20:00Z"), lists: L(12) },
    { takenAt: new Date("2026-09-26T05:20:00Z"), lists: L(15) },
  ]);
  assert.deepEqual(h.map((x) => x.day), ["2026-09-25", "2026-09-26"]);
  assert.equal(h[0].subscribers, 12);
});

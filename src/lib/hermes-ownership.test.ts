import test from "node:test";
import assert from "node:assert/strict";
import { __setStore, InMemoryStore } from "./store.ts";
import {
  appendHermesExchange,
  canAccessSession,
  effectiveOwner,
  getHermesMessages,
  listAllSessions,
  listSessionsFor,
  type HermesSessionMeta,
} from "./hermes.ts";

function meta(over: Partial<HermesSessionMeta> = {}): HermesSessionMeta {
  return {
    id: "s1",
    profile: "default",
    title: "titel",
    updatedAt: "2026-01-01T00:00:00.000Z",
    messageCount: 2,
    ...over,
  };
}

test("effectiveOwner: owner vinder, ellers legacy profile, ellers null", () => {
  assert.equal(effectiveOwner(meta({ owner: "charlie" })), "charlie");
  assert.equal(effectiveOwner(meta({ owner: "delt", profile: "lucas" })), "delt");
  assert.equal(effectiveOwner(meta({ profile: "lucas" })), "lucas");
  assert.equal(effectiveOwner(meta({ profile: "charlie" })), "charlie");
  assert.equal(effectiveOwner(meta({ profile: "default" })), null);
  assert.equal(effectiveOwner(meta({ owner: null, profile: "lucas" })), "lucas");
});

test("canAccessSession: lucas/charlie ser kun eget; delt ser den fælles bøtte", () => {
  const lucas = meta({ owner: "lucas" });
  const charlie = meta({ owner: "charlie" });
  const deltSession = meta({ owner: "delt" });
  const legacyDefault = meta({ profile: "default" });
  const legacyLucas = meta({ profile: "lucas" });

  assert.equal(canAccessSession(lucas, "lucas"), true);
  assert.equal(canAccessSession(lucas, "charlie"), false);
  assert.equal(canAccessSession(lucas, "delt"), false);
  assert.equal(canAccessSession(lucas, "ukendt"), false);

  assert.equal(canAccessSession(charlie, "charlie"), true);
  assert.equal(canAccessSession(charlie, "lucas"), false);

  assert.equal(canAccessSession(legacyLucas, "lucas"), true);
  assert.equal(canAccessSession(legacyLucas, "charlie"), false);

  assert.equal(canAccessSession(deltSession, "lucas"), false);
  assert.equal(canAccessSession(deltSession, "delt"), true);
  assert.equal(canAccessSession(legacyDefault, "delt"), true);
  assert.equal(canAccessSession(legacyDefault, "lucas"), false);
  assert.equal(canAccessSession(legacyDefault, "charlie"), false);
  // null-ejer (ingen session) må aldrig give adgang til en person.
  assert.equal(canAccessSession(meta({ owner: null }), "lucas"), false);
});

test("listSessionsFor: kun egne samtaler, nyeste først", async () => {
  __setStore(new InMemoryStore());
  try {
    await appendHermesExchange("a", "lucas", "hej", "hej igen");
    await appendHermesExchange("b", "charlie", "hej", "hej igen");
    await appendHermesExchange("c", "delt", "hej", "hej igen");

    const mine = await listSessionsFor("lucas");
    assert.deepEqual(mine.map((s) => s.id), ["a"]);
    assert.deepEqual((await listSessionsFor("charlie")).map((s) => s.id), ["b"]);
    assert.deepEqual((await listSessionsFor("delt")).map((s) => s.id), ["c"]);
    assert.equal((await listAllSessions()).length, 3);
  } finally {
    __setStore(null);
  }
});

test("appendHermesExchange stemper owner og afviser fremmed samtale", async () => {
  __setStore(new InMemoryStore());
  try {
    await appendHermesExchange("ny", "lucas", "mit spørgsmål", "svaret");
    const [created] = await listAllSessions();
    assert.equal(created.owner, "lucas");
    assert.equal(created.profile, "lucas");
    assert.equal(created.title, "mit spørgsmål");
    assert.equal(created.messageCount, 2);
    assert.equal((await getHermesMessages("ny")).length, 2);

    // Charlie kan ikke skrive videre i Lucases samtale.
    await assert.rejects(
      () => appendHermesExchange("ny", "charlie", "kapring", "svar"),
      /ikke din samtale/,
    );
    // Og Lucases historik er urørt.
    assert.equal((await getHermesMessages("ny")).length, 2);
    assert.equal((await listAllSessions())[0].owner, "lucas");

    // "delt" (fælles-login) må IKKE overtage en personsamtale.
    await assert.rejects(() => appendHermesExchange("ny", "delt", "x", "y"), /ikke din samtale/);
  } finally {
    __setStore(null);
  }
});

test("appendHermesExchange: delt beholder adgang til legacy-fællessamtale", async () => {
  __setStore(new InMemoryStore());
  try {
    // Legacy-post uden owner (skrevet før ejerskab fandtes).
    const legacy = new InMemoryStore();
    await legacy.put("hermes/sessions", [meta({ id: "gammel", profile: "default" })]);
    __setStore(legacy);
    await appendHermesExchange("gammel", "delt", "opfølgning", "svar");
    const [s] = await listAllSessions();
    assert.equal(s.id, "gammel");
    assert.equal(s.owner, "delt");
  } finally {
    __setStore(null);
  }
});

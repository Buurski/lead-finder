import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { __setStore, InMemoryStore } from "../store.ts";
import { keepIdea, openIdeaCleanup, saveIdeaCleanup } from "./idea-cleanup.ts";

beforeEach(() => __setStore(new InMemoryStore()));
after(() => __setStore(null));

const s = (id: string, kind = "overlap") => ({ id, title: `Idé ${id}`, kind, reason: "Næsten samme emne som X", ...(kind === "overlap" ? { overlapWith: "X" } : {}) });

test("openIdeaCleanup: kun kort der stadig er idéer og ikke er beholdt", async () => {
  await saveIdeaCleanup({ checkedAt: "2026-10-05T07:00:00Z", ideas: 12, suggestions: [s("a"), s("b", "svag"), s("c", "for-mange")] });
  await keepIdea("b");
  await keepIdea("b");
  const open = await openIdeaCleanup(new Set(["b", "c"]));
  assert.equal(open.checkedAt, "2026-10-05T07:00:00Z");
  assert.deepEqual(open.suggestions.map((x) => x.id), ["c"]);
  // Ny kørsel overskriver forslagene, men "Behold" gælder stadig.
  await saveIdeaCleanup({ checkedAt: "2026-10-19T07:00:00Z", ideas: 3, suggestions: [s("b")] });
  assert.deepEqual((await openIdeaCleanup(new Set(["b"]))).suggestions, []);
});

test("saveIdeaCleanup afviser ukendt kind/felt og manglende grund", async () => {
  await assert.rejects(saveIdeaCleanup({ checkedAt: "2026-10-05T07:00:00Z", ideas: 1, suggestions: [s("a", "slet")] }), /overlap eller svag/);
  await assert.rejects(saveIdeaCleanup({ checkedAt: "2026-10-05T07:00:00Z", ideas: 1, suggestions: [{ ...s("a"), delete: true }] }), /kendes ikke/);
  await assert.rejects(saveIdeaCleanup({ checkedAt: "2026-10-05T07:00:00Z", ideas: 1, suggestions: [{ ...s("a"), reason: "" }] }), /mangler/);
  assert.deepEqual((await openIdeaCleanup(new Set(["a"]))).suggestions, []);
});

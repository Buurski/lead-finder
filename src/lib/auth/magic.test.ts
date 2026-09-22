import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { __setStore, createStore } from "../store.ts";
import { appUsers, issueLoginToken, redeemLoginToken, TOKEN_TTL_MS, userForEmail } from "./magic.ts";

beforeEach(() => {
  process.env.STORE_DRIVER = "memory";
  __setStore(null);
  createStore();
  process.env.CC_USERS = "lucas:Lucas@Example.dk, charlie:charlie@example.dk, hacker:x@y.dk";
});

test("brugere læses fra CC_USERS, kun lucas/charlie, lowercase", () => {
  assert.deepEqual(appUsers(), [
    { id: "lucas", email: "lucas@example.dk" },
    { id: "charlie", email: "charlie@example.dk" },
  ]);
  assert.equal(userForEmail(" LUCAS@example.dk ")?.id, "lucas");
  assert.equal(userForEmail("x@y.dk"), null);
});

test("token kan indløses præcis én gang", async () => {
  const t = await issueLoginToken({ id: "charlie", email: "charlie@example.dk" });
  assert.equal(await redeemLoginToken(t), "charlie");
  assert.equal(await redeemLoginToken(t), null);
});

test("udløbet token afvises", async () => {
  const now = Date.now();
  const t = await issueLoginToken({ id: "lucas", email: "lucas@example.dk" }, now);
  assert.equal(await redeemLoginToken(t, now + TOKEN_TTL_MS + 1), null);
});

test("forkert/forfalsket token afvises", async () => {
  assert.equal(await redeemLoginToken("kort"), null);
  assert.equal(await redeemLoginToken("A".repeat(43)), null);
});

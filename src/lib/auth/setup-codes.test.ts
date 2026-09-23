import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSetupCode } from "./setup-codes.ts";

const FORMAT = /^[2-9A-HJ-NP-Z]{4}(-[2-9A-HJ-NP-Z]{4}){4}$/;
const ALPHABET = new Set("23456789ABCDEFGHJKLMNPQRSTUVWXYZ");

test("en kode har formatet 5x4 tegn adskilt af bindestreg", () => {
  assert.match(generateSetupCode(), FORMAT);
});

test("100 koder er unikke og bruger kun det uambiguøse alfabet", () => {
  const codes = new Set<string>();
  for (let i = 0; i < 100; i++) {
    const code = generateSetupCode();
    assert.match(code, FORMAT);
    codes.add(code);
    for (const ch of code) {
      if (ch === "-") continue;
      assert.ok(ALPHABET.has(ch), `uventet tegn: ${ch}`);
    }
  }
  assert.equal(codes.size, 100);
});

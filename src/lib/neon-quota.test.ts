import assert from "node:assert/strict";
import test from "node:test";
import { fetchNeonProject, quotaStatus } from "./neon-quota.ts";

test("quotaStatus: under 70 % er ok, fra 70 % advarer", () => {
  const end = "2026-11-01T00:00:00Z";
  assert.deepEqual(quotaStatus({ compute_time_seconds: 69 * 3600, consumption_period_end: end }), {
    ok: true, pct: 69, note: "Neon 69 % (69.0/100 CU-t), nulstilles 2026-11-01",
  });
  assert.equal(quotaStatus({ compute_time_seconds: 70 * 3600, consumption_period_end: end }).ok, false);
  // 19/10-tallet fra konsollen: 396 504 s = 110 %.
  assert.equal(quotaStatus({ compute_time_seconds: 396504 }).pct, 110);
  assert.equal(quotaStatus({}).ok, true);
});

test("fetchNeonProject: fejler højlydt uden nøgle og ved API-fejl", async () => {
  const saved = { key: process.env.NEON_API_KEY, id: process.env.NEON_PROJECT_ID };
  try {
    delete process.env.NEON_API_KEY;
    process.env.NEON_PROJECT_ID = "p";
    await assert.rejects(fetchNeonProject(), /NEON_API_KEY/);
    process.env.NEON_API_KEY = "k";
    await assert.rejects(fetchNeonProject((async () => new Response("", { status: 401 })) as typeof fetch), /401/);
    const p = await fetchNeonProject((async () => Response.json({ project: { compute_time_seconds: 1 } })) as typeof fetch);
    assert.equal(p.compute_time_seconds, 1);
  } finally {
    if (saved.key === undefined) delete process.env.NEON_API_KEY; else process.env.NEON_API_KEY = saved.key;
    if (saved.id === undefined) delete process.env.NEON_PROJECT_ID; else process.env.NEON_PROJECT_ID = saved.id;
  }
});

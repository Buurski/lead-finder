// ops-status.ts — the "did the morning tasks run?" heartbeat. DERIVED from each
// daily output's OWN artifact (leadgen run, inbox digest, messenger vault file), so
// it works immediately without any Cowork-written status file. Powers the Mission
// Control morgen-vitals strip: one green/amber/red dot per task + age + count.
// Strip-safe.

import { loadRun } from "./leadgen.ts";
import type { LeadgenRun } from "./leadgen.ts";
import { loadDigest } from "./inbox-digest.ts";
import { readVaultJson } from "./vault.ts";

export type VitalStatus = "fresh" | "stale" | "missing";

export interface TaskVital {
  task: "leadgen" | "messenger" | "inbox";
  label: string;
  at: string | null;
  ageMin: number | null;
  count: number;
  detail: string;
  status: VitalStatus;
}

const FRESH_MIN = 8 * 60;   // < 8h since output  → green (ran this morning)
const STALE_MIN = 26 * 60;  // 8–26h → amber (yesterday-ish); older/none → red

function ageOf(at: string | null): number | null {
  if (!at) return null;
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((Date.now() - t) / 60000));
}
function statusFor(ageMin: number | null): VitalStatus {
  if (ageMin == null) return "missing";
  if (ageMin <= FRESH_MIN) return "fresh";
  if (ageMin <= STALE_MIN) return "stale";
  return "missing";
}

export async function getOpsStatus(): Promise<TaskVital[]> {
  const [lgKv, lgVault, digest, msg] = await Promise.all([
    loadRun().catch(() => null),
    readVaultJson<LeadgenRun>("data/leadgen.json").catch(() => null),
    loadDigest().catch(() => null),
    readVaultJson<{ at?: string; candidates?: unknown[] }>("data/messenger.json").catch(() => null),
  ]);

  // leadgen: fresher of the KV run (in-app scrape) vs the vault file (Cowork ingest).
  const kMs = lgKv?.at ? Date.parse(lgKv.at) : NaN;
  const vMs = lgVault?.at ? Date.parse(lgVault.at) : NaN;
  const lgAt = Number.isFinite(vMs) && (!Number.isFinite(kMs) || vMs >= kMs)
    ? (lgVault?.at ?? null)
    : (Number.isFinite(kMs) ? (lgKv?.at ?? null) : null);
  const lgCount = lgVault?.ingested ?? lgKv?.ingested ?? 0;
  const lgAge = ageOf(lgAt);

  const inAt = digest?.generatedAt ?? null;
  const inAge = ageOf(inAt);
  const inNeeds = digest ? digest.items.filter((i) => i.needsReply).length : 0;

  const msgAt = msg?.at ?? null;
  const msgAge = ageOf(msgAt);
  const msgCount = Array.isArray(msg?.candidates) ? msg.candidates.length : 0;

  return [
    { task: "leadgen", label: "Lead-gen", at: lgAt, ageMin: lgAge, count: lgCount, detail: lgCount ? `${lgCount} tilføjet` : "ingen ny hentning", status: statusFor(lgAge) },
    { task: "messenger", label: "Messenger", at: msgAt, ageMin: msgAge, count: msgCount, detail: msgCount ? `${msgCount} kandidater` : "ingen kø", status: statusFor(msgAge) },
    { task: "inbox", label: "Inbox", at: inAt, ageMin: inAge, count: inNeeds, detail: digest ? `${inNeeds} kræver svar` : "ingen scan", status: statusFor(inAge) },
  ];
}

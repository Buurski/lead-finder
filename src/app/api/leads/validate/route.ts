import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { isChain } from "@/lib/chains";
import { isPublicEntity } from "@/lib/qualify";
import { isBlacklisted } from "@/lib/tone-mixer";
import { branchConfidence } from "@/lib/branch-confidence";
import { probeWebsite } from "@/lib/probe-website";
import { achievementStrings } from "@/lib/achievements";
import { store } from "@/lib/store";

// POST /api/leads/validate — batch lead validation (Del 3 Block 4).
//
// For each "new" lead not validated in the last 7 days: classify chain / public /
// hostile, score branch-routing confidence (neutral when unsure), probe the
// website (dead/slow/old/blocked), and extract achievements. Results are cached
// in the STORE keyed by lead id (validation/{id}) — NOT written back to the
// Sheets lead rows, so production lead data is never mutated by this run.
//
// Optional auth: if CRON_SECRET is set, require `Authorization: Bearer <secret>`.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

interface Validation {
  leadId: string;
  name: string;
  chain: boolean;
  public: boolean;
  hostile: boolean;
  branchGroupConfirmed: string;
  branchConfidence: number;
  websiteHttpStatus: string;
  websiteResponseMs?: number;
  achievements: string[];
  validatedAt: string;
}

async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let limit = 50;
  try {
    const b = await req.json();
    if (b && typeof b.limit === "number") limit = Math.min(200, Math.max(1, b.limit));
  } catch {
    /* default */
  }

  let leads;
  try {
    leads = await getLeads();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `sheets: ${String(err)}`, validated: 0 }, { status: 200 });
  }

  // Candidates: status "new", not validated within 7 days (cache in store).
  const candidates: typeof leads = [];
  for (const l of leads) {
    if (l.status !== "new") continue;
    const cached = await store.get<Validation>(`validation/${l.id}`);
    if (cached && Date.now() - Date.parse(cached.validatedAt) < SEVEN_DAYS_MS) continue;
    candidates.push(l);
    if (candidates.length >= limit) break;
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, validated: 0, note: "alle leads er friske" });
  }

  const results = await mapLimited(candidates, 6, async (l): Promise<Validation> => {
    const chain = isChain(l.name);
    const pub = isPublicEntity(l);
    const hostile = isBlacklisted(l.name);
    const bc = branchConfidence(l);
    const probe = (chain || pub || hostile)
      ? { status: "skipped", responseMs: undefined as number | undefined }
      : await probeWebsite(l.website);
    const achievements = achievementStrings(
      { text: `${l.notes || ""}\n${l.enrichedInfo || ""}`, source: "lead" },
    );
    const v: Validation = {
      leadId: l.id,
      name: l.name,
      chain,
      public: pub,
      hostile,
      branchGroupConfirmed: bc.group,
      branchConfidence: bc.confidence,
      websiteHttpStatus: probe.status,
      websiteResponseMs: probe.responseMs,
      achievements,
      validatedAt: new Date().toISOString(),
    };
    try { await store.put(`validation/${l.id}`, v); } catch { /* best-effort */ }
    return v;
  });

  const summary = {
    ok: true,
    validated: results.length,
    chains: results.filter((r) => r.chain).length,
    public: results.filter((r) => r.public).length,
    hostile: results.filter((r) => r.hostile).length,
    neutralBranch: results.filter((r) => r.branchGroupConfirmed === "neutral").length,
    deadSites: results.filter((r) => r.websiteHttpStatus === "dead").length,
    blockedSites: results.filter((r) => r.websiteHttpStatus === "blocked").length,
    withAchievements: results.filter((r) => r.achievements.length > 0).length,
    note: "results cached in store (validation/{id}) — Sheets rows not modified",
  };
  return NextResponse.json(summary);
}

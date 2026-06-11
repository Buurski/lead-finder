// hermes.ts — server-side client for the hermes-api shim on the VPS.
// The shim (vps/hermes_api.py) wraps the Hermes Agent CLI and expects every
// request signed: HMAC-SHA256(secret, "{ts}.{METHOD}.{path}.{body}") as a
// Bearer token plus X-Timestamp. Secret + URL come from env so nothing
// sensitive lives in the repo.
//
// Chat history is stored website-side (store.ts → KV on Vercel) because the
// Hermes CLI only exposes session previews, not full transcripts.

import crypto from "node:crypto";
import { store } from "./store";

export type HermesProfile = "default" | "lucas" | "charlie";
export const HERMES_PROFILES: HermesProfile[] = ["default", "lucas", "charlie"];

export interface HermesChatResult {
  ok: boolean;
  reply?: string;
  error?: string;
  elapsedMs?: number;
}

export interface HermesCronJob {
  id: string;
  name: string;
  prompt?: string;
  schedule_display?: string;
  enabled?: boolean;
  state?: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: string | null;
  last_error?: string | null;
  deliver?: string | null;
  profile?: string | null;
}

export interface HermesSessionMeta {
  id: string;
  profile: HermesProfile;
  title: string;
  updatedAt: string;
  messageCount: number;
}

export interface HermesMessage {
  role: "you" | "hermes";
  text: string;
  ts: string;
}

export function hermesConfigured(): boolean {
  return Boolean(process.env.HERMES_API_URL && process.env.HERMES_API_SECRET);
}

function sign(method: string, path: string, body: string): { ts: string; sig: string } {
  const secret = process.env.HERMES_API_SECRET ?? "";
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = crypto
    .createHmac("sha256", secret)
    .update(Buffer.from(`${ts}.${method}.${path}.${body}`, "utf-8"))
    .digest("hex");
  return { ts, sig };
}

async function hermesFetch<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  timeoutMs = 20_000,
): Promise<{ status: number; data: T | null }> {
  if (!hermesConfigured()) return { status: 0, data: null };
  const base = (process.env.HERMES_API_URL ?? "").replace(/\/$/, "");
  const raw = body == null ? "" : JSON.stringify(body);
  const { ts, sig } = sign(method, path, raw);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "X-Timestamp": ts,
        Authorization: `Bearer ${sig}`,
        ...(raw ? { "Content-Type": "application/json" } : {}),
      },
      body: raw || undefined,
      signal: ctrl.signal,
      cache: "no-store",
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { status: res.status, data };
  } catch {
    return { status: 0, data: null };
  } finally {
    clearTimeout(timer);
  }
}

export async function hermesHealth(): Promise<{
  configured: boolean;
  reachable: boolean;
  gatewayRunning: boolean;
  cronJobs: number;
}> {
  if (!hermesConfigured()) return { configured: false, reachable: false, gatewayRunning: false, cronJobs: 0 };
  const { status, data } = await hermesFetch<{ ok: boolean; gateway_running: boolean; cron_jobs: number }>(
    "GET",
    "/api/health",
    undefined,
    8_000,
  );
  return {
    configured: true,
    reachable: status === 200 && Boolean(data?.ok),
    gatewayRunning: Boolean(data?.gateway_running),
    cronJobs: data?.cron_jobs ?? 0,
  };
}

export async function hermesCronList(): Promise<HermesCronJob[]> {
  const { status, data } = await hermesFetch<{ jobs: HermesCronJob[] }>("GET", "/api/cron", undefined, 10_000);
  if (status !== 200 || !data) return [];
  return data.jobs ?? [];
}

export async function hermesCronAction(
  id: string,
  action: "run" | "pause" | "resume",
): Promise<{ ok: boolean; error?: string }> {
  const { status, data } = await hermesFetch<{ ok?: boolean; error?: string }>(
    "POST",
    "/api/cron/action",
    { id, action },
    30_000,
  );
  if (status === 200 && data?.ok) return { ok: true };
  return { ok: false, error: data?.error ?? `hermes-api svarede ${status || "ikke"}` };
}

export async function hermesChat(
  message: string,
  profile: HermesProfile,
  sessionId: string,
): Promise<HermesChatResult> {
  const { status, data } = await hermesFetch<{ reply?: string; error?: string; elapsed_ms?: number }>(
    "POST",
    "/api/chat",
    { message, profile, session_id: sessionId },
    180_000,
  );
  if (status === 200 && data?.reply) {
    return { ok: true, reply: data.reply, elapsedMs: data.elapsed_ms };
  }
  if (status === 0) return { ok: false, error: "Kunne ikke nå Hermes (VPS offline eller HERMES_API_URL mangler)" };
  return { ok: false, error: data?.error ?? `Hermes-fejl (${status})` };
}

// ---------- website-side session store ----------

const SESSIONS_KEY = "hermes/sessions";
const messagesKey = (id: string) => `hermes/messages-${id}`;

export async function listHermesSessions(profile?: HermesProfile): Promise<HermesSessionMeta[]> {
  const all = (await store.get<HermesSessionMeta[]>(SESSIONS_KEY)) ?? [];
  const filtered = profile ? all.filter((s) => s.profile === profile) : all;
  return filtered.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 30);
}

export async function getHermesMessages(sessionId: string): Promise<HermesMessage[]> {
  return (await store.get<HermesMessage[]>(messagesKey(sessionId))) ?? [];
}

export async function appendHermesExchange(
  sessionId: string,
  profile: HermesProfile,
  userText: string,
  replyText: string,
): Promise<void> {
  const t = Date.now();
  const now = new Date(t).toISOString();
  // Reply gets +1ms so two messages never share an identical timestamp
  // (keeps sortering/dedup deterministisk).
  const replyTs = new Date(t + 1).toISOString();
  const msgs = await getHermesMessages(sessionId);
  msgs.push({ role: "you", text: userText, ts: now }, { role: "hermes", text: replyText, ts: replyTs });
  await store.put(messagesKey(sessionId), msgs.slice(-200));

  const all = (await store.get<HermesSessionMeta[]>(SESSIONS_KEY)) ?? [];
  const existing = all.find((s) => s.id === sessionId);
  if (existing) {
    existing.updatedAt = now;
    existing.messageCount = msgs.length;
  } else {
    all.push({
      id: sessionId,
      profile,
      title: userText.slice(0, 60),
      updatedAt: now,
      messageCount: msgs.length,
    });
  }
  // Per-profil loft (30 nyeste) i stedet for globalt — ellers kan én flittig
  // profil skubbe de andres historik ud af KV.
  const sorted = all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  const trimmed = HERMES_PROFILES.flatMap((p) => sorted.filter((s) => s.profile === p).slice(0, 30));
  await store.put(SESSIONS_KEY, trimmed);
}

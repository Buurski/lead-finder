// ai.ts — the single model gateway for the whole pipeline (brief "AI" phase).
//
// One entry point, `generate()`, used by RESEARCH + QUALIFY (Sonnet 4.6) and
// DRAFT (Opus 4.8). Provider resolution, in order:
//
//   1. Vercel AI Gateway (AI SDK)  — when AI_GATEWAY_API_KEY is set. Uses the
//      AI SDK with plain "provider/model" strings, which auto-route through the
//      gateway (observability, fallbacks, ZDR). This is the preferred path.
//   2. Anthropic direct (raw /v1/messages fetch) — when only ANTHROPIC_API_KEY
//      is set. Zero extra deps, identical behaviour in Node + Next.
//   3. Deterministic fallback — no key (or AI_DISABLED=1): returns null so the
//      caller uses its own deterministic composer. The system ALWAYS works.
//
// Design constraints honoured:
//   - Strip-safe (no enums/namespaces/decorators): the plain-node engine CLI
//     imports this transitively via Node 24 type-stripping, no build step.
//   - The AI SDK is loaded with a LAZY dynamic import inside the call path only,
//     so the no-key / dry-run path never loads it (and a missing/broken `ai`
//     package degrades to the Anthropic fetch or to null instead of throwing).
//   - Every model is configurable per env; sensible Claude 4.x defaults.

import { logSpend, estimateTokens } from "./spend-log.ts";

export type AiTask = "research" | "qualify" | "draft";

export interface AiRequest {
  task: AiTask;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface AiResult {
  text: string;
  provider: "gateway" | "anthropic";
  model: string;
  // Exact token usage when the provider returns it (Anthropic direct). Undefined
  // on the gateway path → spend logging falls back to a length estimate.
  usage?: { inputTokens: number; outputTokens: number };
}

// ---- model selection (env-configurable) ---------------------------------
// Gateway model strings carry the "provider/" prefix; the Anthropic-direct
// path strips it. Defaults: research+qualify = Sonnet 4.6, draft = Opus 4.8.
const DEFAULT_MODELS: Record<AiTask, string> = {
  research: "anthropic/claude-sonnet-4-6",
  qualify: "anthropic/claude-sonnet-4-6",
  draft: "anthropic/claude-opus-4-8",
};

export function modelFor(task: AiTask): string {
  const env =
    task === "draft"
      ? process.env.AI_MODEL_DRAFT
      : task === "qualify"
        ? process.env.AI_MODEL_QUALIFY
        : process.env.AI_MODEL_RESEARCH;
  return (env && env.trim()) || DEFAULT_MODELS[task];
}

// "anthropic/claude-sonnet-4-6" -> "claude-sonnet-4-6" for the direct API.
export function stripProvider(model: string): string {
  const i = model.indexOf("/");
  return i === -1 ? model : model.slice(i + 1);
}

// ---- capability probe (for diagnostics / BLOCKERS) ----------------------
export type AiProvider = "gateway" | "anthropic" | "none";

export function activeProvider(): AiProvider {
  if (process.env.AI_DISABLED === "1") return "none";
  if (process.env.AI_GATEWAY_API_KEY) return "gateway";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "none";
}

export function isAiEnabled(): boolean {
  return activeProvider() !== "none";
}

export function aiStatus(): { provider: AiProvider; models: Record<AiTask, string>; enabled: boolean } {
  return {
    provider: activeProvider(),
    enabled: isAiEnabled(),
    models: { research: modelFor("research"), qualify: modelFor("qualify"), draft: modelFor("draft") },
  };
}

// ---- gateway path (AI SDK) ----------------------------------------------
async function viaGateway(req: AiRequest, model: string): Promise<string | null> {
  try {
    const mod = (await import("ai")) as unknown as {
      generateText: (o: Record<string, unknown>) => Promise<{ text?: string }>;
    };
    const { text } = await mod.generateText({
      model, // plain "provider/model" string -> Vercel AI Gateway
      system: req.system,
      prompt: req.prompt,
      maxOutputTokens: req.maxTokens ?? 700,
      temperature: req.temperature ?? 0.7,
      abortSignal: AbortSignal.timeout(req.timeoutMs ?? 45000),
    });
    const out = (text ?? "").trim();
    return out || null;
  } catch {
    return null;
  }
}

// ---- anthropic-direct path (raw fetch) ----------------------------------
interface AnthropicResponse { text: string; usage?: { inputTokens: number; outputTokens: number } }
async function viaAnthropic(req: AiRequest, model: string): Promise<AnthropicResponse | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: stripProvider(model),
        max_tokens: req.maxTokens ?? 700,
        temperature: req.temperature ?? 0.7,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: "user", content: req.prompt }],
      }),
      signal: AbortSignal.timeout(req.timeoutMs ?? 45000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: Array<{ text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    const text = (data.content ?? []).map((c) => c.text ?? "").join("").trim();
    if (!text) return null;
    const u = data.usage;
    return {
      text,
      usage: u ? { inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens ?? 0 } : undefined,
    };
  } catch {
    return null;
  }
}

// ---- public entry point --------------------------------------------------
// Returns null whenever no model is available or the call fails, so every
// caller can fall back to its deterministic path. NEVER throws.
export async function generate(req: AiRequest): Promise<AiResult | null> {
  const provider = activeProvider();
  if (provider === "none") return null;
  const model = modelFor(req.task);

  const result = await runGenerate(req, provider, model);
  if (result) void trackSpend(req, result);
  return result;
}

async function runGenerate(req: AiRequest, provider: AiProvider, model: string): Promise<AiResult | null> {
  if (provider === "gateway") {
    const text = await viaGateway(req, model);
    if (text) return { text, provider: "gateway", model };
    // Gateway failed (network/quota) — try Anthropic direct if a key exists.
    const fb = await viaAnthropic(req, model);
    if (fb) return { text: fb.text, provider: "anthropic", model: stripProvider(model), usage: fb.usage };
    return null;
  }
  // provider === "anthropic"
  const r = await viaAnthropic(req, model);
  if (r) return { text: r.text, provider: "anthropic", model: stripProvider(model), usage: r.usage };
  return null;
}

// Transparent spend logging — exact tokens when the provider returns them
// (Anthropic direct), else a length estimate. Best-effort, never throws.
async function trackSpend(req: AiRequest, result: AiResult): Promise<void> {
  try {
    const exact = result.usage;
    const inputTokens = exact ? exact.inputTokens : estimateTokens((req.system ?? "") + "\n" + req.prompt);
    const outputTokens = exact ? exact.outputTokens : estimateTokens(result.text);
    await logSpend({
      task: req.task,
      model: result.model,
      provider: result.provider,
      inputTokens,
      outputTokens,
      estimated: !exact,
    });
  } catch {
    /* never break generation over logging */
  }
}

// jev.ts — thin client for TypeSafe's Jev (System One) decision model.
//
// Jev returns typed judgments (Choice / Score / Noul) with probabilities; it
// never generates text. Code owns the workflow, Jev supplies one narrow
// judgment per question. Rules (council 2026-09-20):
//   - Never throws: missing key, timeout, HTTP error, malformed body → null,
//     caller falls back to deterministic logic (same contract as ai.ts).
//   - Never logs the state (it may contain scraped page text). Only status.
//   - Key only from TYPESAFE_API_KEY (Vercel env via --value, never in git).
//
// Strip-safe (no enums/namespaces) so node --experimental-strip-types tests
// and the plain-node engine CLI can import it.

export type JevNoulQuestion = {
  type: "noul";
  instructions: string | Record<string, unknown>;
  criteria?: { true?: string; false?: string };
};
export type JevChoiceQuestion = {
  type: "choice";
  instructions: string | Record<string, unknown>;
  criteria: Record<string, string | null>;
};
export type JevScoreQuestion = {
  type: "score";
  instructions: string | Record<string, unknown>;
  /** Ordered level descriptions. MUST be a list (object form → HTTP 422). */
  criteria: string[];
};
export type JevQuestion = JevNoulQuestion | JevChoiceQuestion | JevScoreQuestion;

export type JevNoulAnswer = { type: "noul"; noul: number };
export type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
};
export type JevScoreAnswer = {
  type: "score";
  /** 0-indexed position on the criteria list (5 levels → 0..4). */
  score: number;
  confidence: number;
  probabilities: Record<string, number>;
};
export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;
export type JevAnswers = Record<string, JevAnswer>;

export interface JevResult {
  model: string;
  answers: JevAnswers;
  usage?: { input_tokens: number; output_tokens: number };
  ms: number;
}

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
// Pinned (samme som VPS'ens jev_lib.py): jev-latest flytter sig ved nye releases,
// og så skifter alle domme/karakterer uden at koden har ændret sig.
export const JEV_MODEL = "jev-1.13.0";

export function jevEnabled(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY) && process.env.JEV_DISABLED !== "1";
}

/**
 * Ask Jev a set of independent questions over one state. Questions run in
 * parallel server-side; output tokens are free, so speculative extra
 * questions cost only the shared input.
 */
export async function jevAsk(
  state: unknown,
  questions: Record<string, JevQuestion>,
  opts: { timeoutMs?: number; model?: string } = {},
): Promise<JevResult | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key || process.env.JEV_DISABLED === "1") return null;
  const t0 = Date.now();
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ state, model: opts.model ?? JEV_MODEL, questions }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) {
      console.warn(`[jev] HTTP ${res.status}`);
      return null;
    }
    const body = (await res.json()) as Partial<JevResult>;
    if (!body || typeof body !== "object" || !body.answers || typeof body.answers !== "object") {
      console.warn("[jev] malformed response");
      return null;
    }
    return {
      model: String(body.model ?? opts.model ?? JEV_MODEL),
      answers: body.answers as JevAnswers,
      usage: body.usage,
      ms: Date.now() - t0,
    };
  } catch (e) {
    console.warn(`[jev] ${e instanceof Error ? e.name : "error"}`);
    return null;
  }
}

/** Compact accessors. Return undefined when the answer is missing or of another type. */
export function noul(a: JevAnswers | undefined, id: string): number | undefined {
  const x = a?.[id];
  return x && x.type === "noul" ? x.noul : undefined;
}
export function score(a: JevAnswers | undefined, id: string): number | undefined {
  const x = a?.[id];
  return x && x.type === "score" ? x.score : undefined;
}
export function choice(a: JevAnswers | undefined, id: string): { choice: string; confidence: number } | undefined {
  const x = a?.[id];
  return x && x.type === "choice" ? { choice: x.choice, confidence: x.confidence } : undefined;
}

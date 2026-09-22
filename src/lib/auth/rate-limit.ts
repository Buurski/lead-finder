// Per-IP rate limit via Vercel KV REST (Edge-safe: kun fetch). Flyttet ud af
// proxy.ts så login-link-ruten kan bruge samme mekanisme med eget præfiks.
// Fail-open hvis KV mangler/er nede — auth-tjekket selv gater stadig adgang.

export const RL_WINDOW_S = 60;
export const RL_MAX = 5;
export const RL_BLOCK_S = 60 * 60;

export async function rateLimitCheck(
  ip: string,
  prefix = "auth",
): Promise<{ allowed: boolean; remaining: number; blocked: boolean }> {
  const url = process.env.KV_REST_API_URL;
  const tok = process.env.KV_REST_API_TOKEN;
  if (!url || !tok) return { allowed: true, remaining: RL_MAX, blocked: false };

  const key = `${prefix}:rl:${ip}`;
  const blockKey = `${prefix}:block:${ip}`;
  const auth = { Authorization: `Bearer ${tok}` };

  try {
    const blockedRes = await fetch(`${url}/get/${blockKey}`, { headers: auth, signal: AbortSignal.timeout(2500) });
    const blockedJson = blockedRes.ok ? ((await blockedRes.json()) as { result?: unknown }) : { result: null };
    if (blockedJson.result) return { allowed: false, remaining: 0, blocked: true };

    const pipeRes = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", key],
        ["EXPIRE", key, String(RL_WINDOW_S), "NX"],
      ]),
      signal: AbortSignal.timeout(2500),
    });
    const pipeJson = pipeRes.ok ? ((await pipeRes.json()) as Array<{ result?: number }>) : null;
    const count = pipeJson?.[0]?.result ?? 0;
    if (count > RL_MAX) {
      await fetch(`${url}/setex/${blockKey}/${RL_BLOCK_S}/1`, { headers: auth, signal: AbortSignal.timeout(2500) }).catch(() => {});
      return { allowed: false, remaining: 0, blocked: true };
    }
    return { allowed: true, remaining: Math.max(0, RL_MAX - count), blocked: false };
  } catch {
    return { allowed: true, remaining: RL_MAX, blocked: false };
  }
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

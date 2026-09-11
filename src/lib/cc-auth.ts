// Shared Command Center-auth: proxyen er den ENESTE, der kan udstede markeren
// (alle indgående kopier strippes i src/proxy.ts), og værdien er en HMAC over
// AUTH_SESSION_SECRET — så en klient kan hverken gætte eller forfalske den.
// Edge-safe (Web Crypto only): bruges både af proxyen og af API-ruter.

export const CC_AUTH_HEADER = "x-command-center-auth";

export function ctEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  const len = Math.max(ab.length, bb.length);
  let diff = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}

export async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  const bytes = new Uint8Array(sig);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0");
  return hex;
}

/** Deterministisk marker — kun udledelig med AUTH_SESSION_SECRET. */
export function ccAuthMarker(secret: string): Promise<string> {
  return hmacHex(secret, "command-center");
}

/** True kun når anmodningen bærer et gyldigt, proxy-udstedt marker. */
export async function isCommandCenterRequest(req: Request): Promise<boolean> {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) return false;
  const marker = req.headers.get(CC_AUTH_HEADER);
  if (!marker) return false;
  return ctEqual(marker, await ccAuthMarker(secret));
}

/**
 * Fælles skrive-guard for API-ruter (fakturaer m.fl.): proxy-marker påkrævet
 * når auth er konfigureret, og kalderen SKAL være same-origin. Samme
 * tillidskæde som CRM-ruterne bruger (crm.ts) — læse-ruter er urørt.
 */
export async function assertWriteRequest(req: Request): Promise<void> {
  const authConfigured = Boolean(process.env.VERCEL_BASIC_AUTH_USER && process.env.VERCEL_BASIC_AUTH_PASS && process.env.AUTH_SESSION_SECRET);
  if (authConfigured && !(await isCommandCenterRequest(req))) {
    throw new Error("kræver en godkendt Command Center-session");
  }
  const origin = req.headers.get("origin");
  if (!origin) throw new Error("kald uden Origin afvist");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(req.url).protocol.replace(":", "");
  if (origin.toLowerCase() !== `${proto}://${host}`.toLowerCase()) throw new Error("cross-origin kald afvist");
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new Error("cross-site kald afvist");
}

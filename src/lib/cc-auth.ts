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

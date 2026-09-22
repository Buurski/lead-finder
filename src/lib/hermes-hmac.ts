import crypto from "node:crypto";
import { ctEqual } from "./cc-auth.ts";

// Indgående kald FRA Hermes (VPS) til lead-finder. Samme skema som når
// lead-finder kalder Hermes-shimmen (hermes.ts sign()):
//   X-Timestamp: <unix-sek>
//   Authorization: Bearer hex(hmac_sha256(HERMES_API_SECRET, `${ts}.${METHOD}.${path}.${body}`))
// path = pathname + query. Maks 5 min ur-forskel (replay-vindue).
export const HERMES_SKEW_S = 300;

export function hermesSignature(secret: string, ts: string, method: string, path: string, body = ""): string {
  return crypto.createHmac("sha256", secret).update(`${ts}.${method}.${path}.${body}`, "utf-8").digest("hex");
}

export function verifyHermesRequest(req: Request, secret: string, body = "", nowS = Math.floor(Date.now() / 1000)): boolean {
  if (!secret) return false;
  const ts = req.headers.get("x-timestamp") || "";
  const sig = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!/^\d{9,11}$/.test(ts) || Math.abs(nowS - Number(ts)) > HERMES_SKEW_S) return false;
  const url = new URL(req.url);
  return ctEqual(sig, hermesSignature(secret, ts, req.method, url.pathname + url.search, body));
}

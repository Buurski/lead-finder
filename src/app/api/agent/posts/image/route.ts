// Agent-upload af blogbilleder (Kinly-grafer, som Hermes laver med kinly_graf.py).
// Samme HMAC-skema som /api/agent/posts; egen rute fordi et billede i base64 ikke
// kan være under blog-rutens 120.000-tegns loft.
//   POST { id, slot: "a"|"b"|"c"|"a-mobile"|"b-mobile"|"c-mobile", mime: "image/png"|"image/webp", data: <base64> }
//   → { ok, url }   (offentlig Blob-url som Hermes sætter i images.a.url)
// Ruten gemmer KUN filen — billedvalget, alt-tekst og samtykke går stadig
// gennem update/menneskets knapper i posts.ts.
import { createHash } from "node:crypto";
import { getDb, pgEnabled } from "../../../../../lib/db/client.ts";
import { BlogInputError, getPost } from "../../../../../lib/hq/posts.ts";
import { store } from "../../../../../lib/store.ts";
import { verifyHermesRequest } from "../../../../../lib/hermes-hmac.ts";
import { cleanEnv } from "../../../../../lib/hermes.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status });

const MAX_BODY = 3_000_000; // ~2,2 MB billede efter base64
const MAX_BYTES = 2_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLOTS = new Set(["a", "b", "c", "a-mobile", "b-mobile", "c-mobile"]);
const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  "image/png": { ext: "png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
};

export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > MAX_BODY) return json({ ok: false, error: "for stor" }, 413);
  if (!verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }
  if (!pgEnabled()) return json({ ok: false, error: "CRM kører ikke på Postgres" }, 503);
  let input: { id?: unknown; slot?: unknown; mime?: unknown; data?: unknown };
  try {
    input = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "ugyldig JSON" }, 400);
  }
  try {
    const id = typeof input.id === "string" && UUID.test(input.id) ? input.id : "";
    if (!id) throw new BlogInputError("ugyldigt indlægs-id");
    const slot = typeof input.slot === "string" && SLOTS.has(input.slot) ? input.slot : "";
    if (!slot) throw new BlogInputError("slot skal være a, b, c, a-mobile, b-mobile eller c-mobile");
    const type = typeof input.mime === "string" ? TYPES[input.mime] : undefined;
    if (!type) throw new BlogInputError("kun image/png eller image/webp");
    if (typeof input.data !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.data)) throw new BlogInputError("data skal være base64");
    const bytes = Buffer.from(input.data, "base64");
    if (bytes.length < 100 || bytes.length > MAX_BYTES) throw new BlogInputError("billedet skal være mellem 100 B og 2 MB");
    if (!type.magic(bytes)) throw new BlogInputError("filen er ikke det billedformat mime siger");

    const post = await getPost(getDb(), id);
    if (!post) return json({ ok: false, error: "ukendt indlæg" }, 404);
    // Samme lås som update: et kort i Publicer/Udgivet må agenten ikke røre.
    if (post.stage === "publicer" || post.stage === "udgivet") throw new BlogInputError("kortet er låst i publicer/udgivet");

    const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
    const key = `blog/${id}/${slot}-${hash}.${type.ext}`;
    // Samme bytes → samme nøgle; Blob afviser overskrivning, så genbrug url'en.
    const existing = await store.getAssetUrl(key);
    const url = existing ?? (await store.putAsset(key, bytes, input.mime as string)).url;
    return json({ ok: true, url });
  } catch (err) {
    if (err instanceof BlogInputError) return json({ ok: false, error: err.message }, 400);
    console.error(JSON.stringify({ evt: "agent.posts.image.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

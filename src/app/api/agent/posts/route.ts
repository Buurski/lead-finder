// Agent-vejen til blog-pipelinen (/blog) — samme HMAC-skema som /api/agent/tasks:
//   X-Timestamp: <unix-sek>   Authorization: Bearer ***  `${ts}.POST.${path}.${body}`)
// Undtaget fra proxyens login (api/agent/-præfikset); ruten beskytter sig selv.
//
// Ingen "next/server"-import: route.test.ts kalder handleren direkte under
// node:test, og node kan ikke resolve Next's subpath-eksport. Plain Response er
// samme svar-objekt som NextResponse.json giver.
import { getDb, pgEnabled } from "../../../../lib/db/client.ts";
import {
  BlogInputError,
  createPost,
  getPost,
  listPosts,
  markPublished,
  updatePost,
} from "../../../../lib/hq/posts.ts";
import { jevAsk, jevEnabled, type JevQuestion } from "../../../../lib/jev.ts";
import { verifyHermesRequest } from "../../../../lib/hermes-hmac.ts";
import { cleanEnv } from "../../../../lib/hermes.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (data: unknown, status = 200) => Response.json(data, { status });

// Rutens EGET loft. Et blogindlæg er op til 80.000 tegn, og JSON-rammen om det
// skal også med — tasks-rutens 4.000 tegn må ikke arves her.
const MAX_BODY = 120_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Actor tvinges serverside til "hermes". Payloadens actor-felt kan ALDRIG vælge
 * lucas eller charlie: ellers kunne agenten selv lægge et kort i Publicer eller
 * kalde published, og så var menneskets knap ikke længere menneskets. Menneske-
 * actor kommer kun fra sessionen i UI-ruterne (/api/posts). Alt andet end
 * "hermes" (også en ukendt aktør som "hacker") afvises med 400.
 */
function agentActor(v: unknown): "hermes" {
  const raw = v === undefined || v === null ? "" : String(v).trim().toLowerCase();
  const actor = raw || "hermes";
  if (actor !== "hermes") {
    throw new BlogInputError("agent-ruten skriver som hermes — menneske-handlinger går gennem UI'et");
  }
  return "hermes";
}

function postId(v: unknown): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new BlogInputError("ugyldigt indlægs-id");
  return v;
}

/** id eller slug til opslag (get/precheck). */
function keyOf(input: { id?: unknown; slug?: unknown }): string {
  const raw = input.id ?? input.slug;
  if (typeof raw !== "string" || !raw.trim()) throw new BlogInputError("id eller slug mangler");
  return raw.trim();
}

// Mass-assignment: kun disse felter må sættes via create/update. `stage` flyttes
// kun via move, og publishedAt/publishedUrl/publishRequestedAt/createdBy/updatedBy
// må ALDRIG kunne patches — markPublished er den eneste vej til Udgivet.
const WRITABLE = ["title", "slug", "category", "excerpt", "body", "note", "sourcePath", "images"] as const;
const FORBIDDEN = ["stage", "position", "publishedAt", "publishedUrl", "publishRequestedAt", "createdBy", "updatedBy", "id", "createdAt", "updatedAt"] as const;

/** Felterne til `update {id, fields}` — ukendte/forbudte nøgler afvises, ikke ignoreres. */
function updateFields(v: unknown): Record<string, unknown> {
  if (v === undefined || v === null) return {};
  if (typeof v !== "object" || Array.isArray(v)) throw new BlogInputError("fields skal være et objekt");
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
    if (!(WRITABLE as readonly string[]).includes(key)) {
      throw new BlogInputError(`feltet "${key}" kan ikke sættes her`);
    }
    out[key] = value;
  }
  return out;
}

/** Felterne til `create {...}` — aktørens egne felter ligger i toppen af payloaden. */
function createFields(input: Record<string, unknown>): Record<string, unknown> {
  for (const key of FORBIDDEN) {
    if (key in input) throw new BlogInputError(`feltet "${key}" kan ikke sættes her`);
  }
  const out: Record<string, unknown> = {};
  for (const key of WRITABLE) {
    if (key in input) out[key] = input[key];
  }
  return out;
}

// JEV-spørgsmålene til `precheck`. State (titel/resume/body) sendes til Jev, men
// logges ALDRIG — jev.ts logger kun status, og det er med vilje: body er
// upubliceret tekst.
const JEV_QUESTIONS: Record<string, JevQuestion> = {
  ready: {
    type: "noul",
    instructions:
      "Er indlægget klart til udgivelse — ingen pladsholdere, ingen halvfærdige afsnit, ingen åbenlyse fejl?",
  },
  issue: {
    type: "choice",
    instructions: "Hvad er det alvorligste problem med indlægget, hvis der er et?",
    criteria: {
      ingen: "Intet problem: teksten er færdig og kan udgives som den står",
      pladsholder_eller_todo: "Pladsholder eller TODO/TBD/FIXME/[indsæt …] står stadig i teksten",
      uafsluttet_afsnit: "Et afsnit er halvfærdigt, tomt eller stopper midt i en sætning",
      uverificeret_paastand: "En påstand om tal, priser eller kunder der ikke er belæg for i teksten",
      anden_fejl: "En anden fejl der bør rettes før udgivelse",
    },
  },
};

// POST { actor, action, ... } — blog-pipelinen (create/update/move/list/get/precheck/published).
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > MAX_BODY) return json({ ok: false, error: "for stor" }, 413);
  if (!verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body)) return json({ ok: false, error: "unauthorized" }, 401);
  if (!pgEnabled()) return json({ ok: false, error: "CRM kører ikke på Postgres" }, 503);
  let input: { actor?: unknown; action?: unknown; id?: unknown; slug?: unknown; stage?: unknown; fields?: unknown; url?: unknown; note?: unknown };
  try {
    input = JSON.parse(body);
  } catch {
    return json({ ok: false, error: "ugyldig JSON" }, 400);
  }
  try {
    const actor = agentActor(input.actor);
    const action = typeof input.action === "string" ? input.action : "";
    switch (action) {
      case "create": {
        const post = await createPost(getDb(), createFields(input as unknown as Record<string, unknown>), actor);
        return json({ ok: true, post });
      }
      case "update": {
        const fields = updateFields(input.fields);
        // Et kald uden felter ville ellers være et tavst no-op der alligevel rører
        // updatedAt — og dermed rækkefølgen i kolonnen (listPosts sorterer på den).
        if (Object.keys(fields).length === 0) throw new BlogInputError("ingen felter at rette");
        const post = await updatePost(getDb(), postId(input.id), fields, actor);
        return json({ ok: true, post });
      }
      case "move": {
        // Flytningen skal sige hvorhen: uden stage ville kaldet se ud som en succes
        // uden at flytte noget (updatePost rører kun kolonnen når stage er sat).
        if (input.stage === undefined || input.stage === null) throw new BlogInputError("stage mangler");
        const post = await updatePost(getDb(), postId(input.id), { stage: input.stage }, actor);
        return json({ ok: true, post });
      }
      case "published": {
        // Kun udgiver-jobbet melder live, og kun med url-bevis fra kinly.dk/blog.
        const post = await markPublished(getDb(), postId(input.id), { url: input.url, note: input.note }, actor);
        return json({ ok: true, post });
      }
      case "list": {
        const cards = await listPosts(getDb(), input.stage === undefined || input.stage === null ? {} : { stage: String(input.stage) });
        return json({ ok: true, cards });
      }
      case "get": {
        const post = await getPost(getDb(), keyOf(input));
        return json({ ok: true, post });
      }
      case "precheck": {
        // Findes indlægget? Så er den del deterministisk afklaret uanset JEV.
        const post = await getPost(getDb(), keyOf(input));
        // jev.ts kaster aldrig: slået fra, timeout eller HTTP-fejl → null. Precheck
        // fejler derfor ikke på JEV — udgiver-jobbet behandler null som STOP.
        if (!jevEnabled()) return json({ ok: true, jev: null });
        const jev = await jevAsk(
          { title: post.title, category: post.category, excerpt: post.excerpt, body: post.body },
          JEV_QUESTIONS,
          { timeoutMs: 20_000 },
        );
        return json({ ok: true, jev });
      }
      default:
        return json({ ok: false, error: "ukendt action" }, 400);
    }
  } catch (err) {
    if (err instanceof BlogInputError) return json({ ok: false, error: err.message }, 400);
    console.error(JSON.stringify({ evt: "agent.posts.failed", error: String(err).slice(0, 300) }));
    return json({ ok: false, error: "noget gik galt" }, 500);
  }
}

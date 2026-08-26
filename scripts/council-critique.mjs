// council-critique.mjs — læser screenshot-manifest fra capture-steppet, sender
// hvert preview's desktop+mobil billeder til én vision-model med tre
// uafhængige kritikroller i ÉT kald (ponytail: ét kald i stedet for 3 agents —
// split til rigtige subagents hvis kvaliteten viser sig for ensrettet).
// Skriver findings som kladde i KnowledgeOS/drafts/. Ingen auto-fix, ingen send.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const MANIFEST = process.env.SCREENSHOT_MANIFEST || "/tmp/kinly-screenshot-council/manifest.json";
const OUT_DIR = process.env.COUNCIL_OUT_DIR || "/root/KnowledgeOS/drafts/screenshot-council";
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const KEY = process.env.DEEPSEEK_API_KEY || process.env.CLOUDFLARE_GLM_API_KEY || process.env.OPENROUTER_API_KEY;
if (!KEY) { console.error("CLOUDFLARE_GLM_API_KEY mangler"); process.exit(1); }

const PROMPT = `Du er tre uafhængige design/SEO-kritikere, der each bedømmer denne danske lokale virksomheds demo (billede 1 = desktop, billede 2 = mobil).

Rolle 1 — Konvertering: er det tydeligt hvad man skal gøre (ring/book/besøg)? Er CTA synlig på mobil uden scroll? Er tilliden der (adresse, tider, billeder)?
Rolle 2 — SEO/AI-synlighed: kan en AI citere siden? Navn+by+ydelse i H1/title? Struktur (H2/lister)? Mangler der NAP?
Rolle 3 — Visuel kvalitet: typografi, luft, mobil-layout-brud, billeder af lav kvalitet, generisk skabelon-følelse.

Svar DANSK, kompakt markdown:
## <firmanavn>
**Konvertering:** 2-3 bullets
**SEO/AI:** 2-3 bullets
**Visuelt:** 2-3 bullets
**Verdict:** GO eller FIX (én linje hvorfor)`;

async function critique(item) {
  const img = (p) => `data:image/jpeg;base64,${readFileSync(p).toString("base64")}`;
  const content = [{ type: "text", text: PROMPT }];
  if (!item.desktop.navigationError) content.push({ type: "image_url", image_url: { url: img(item.desktop.path) } });
  if (!item.mobile.navigationError) content.push({ type: "image_url", image_url: { url: img(item.mobile.path) } });
  const endpoint = process.env.DEEPSEEK_API_KEY
    ? "https://api.deepseek.com/v1/chat/completions"
    : `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/v1/chat/completions`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ model: process.env.COUNCIL_MODEL || (process.env.DEEPSEEK_API_KEY ? "deepseek-v4-flash-vision-exp" : "@cf/meta/llama-4-scout-17b-16e-instruct"), max_tokens: 900, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "(tomt svar)";
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
mkdirSync(OUT_DIR, { recursive: true });
let ok = 0, fail = 0;
for (const item of manifest.items) {
  try {
    const text = await critique(item);
    const file = `${OUT_DIR}/${item.id}.md`;
    writeFileSync(file, `# Council — ${item.company}\n\nPreview: ${item.previewUrl}\nKørte: ${new Date().toISOString()}\n\n${text}\n`);
    console.log(`ok ${item.id} -> ${file}`);
    ok++;
  } catch (err) {
    console.error(`fail ${item.id}: ${String(err).slice(0, 120)}`);
    fail++;
  }
}
console.log(JSON.stringify({ ok, fail }));

// e2e_lead.mjs — generic E2E for prompt-gen on any lead.
//   node scripts/e2e_lead.mjs --name "X" --branch café --url site.dk [--ig "notes"]
// Runs reconFull → buildClaudeCodePrompt → writes .send_queue/dispatch_<slug>.md
// + prints a compact recon summary + the slug.
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, "src", "lib", p)).href);
const { reconFull } = await imp("customer-recon-full.ts");
const { buildClaudeCodePrompt } = await imp("prompt-builder.ts");
const { templateForBranch } = await imp("design-templates.ts");

const args = process.argv.slice(2);
const get = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const name = get("--name"), branch = get("--branch") || "", url = get("--url"), ig = get("--ig");
if (!name) { console.error("need --name"); process.exit(1); }

const recon = await reconFull({ name, branch, websiteUrl: url, igNotes: ig });
const template = templateForBranch(branch);
const prompt = buildClaudeCodePrompt({ name, branch, slug: recon.slug, websiteUrl: url }, recon, template, "714926a");

const out = path.join(ROOT, ".send_queue", `dispatch_${recon.slug}.md`);
fs.writeFileSync(out, prompt, "utf-8");

console.log(JSON.stringify({
  slug: recon.slug, template: template.slug, sources: recon.sources,
  title: recon.title, desc: (recon.description || "").slice(0, 140),
  palette: recon.palette, headings: recon.headings.slice(0, 6),
  images: recon.images.slice(0, 6), promptChars: prompt.length, promptFile: out,
}, null, 2));

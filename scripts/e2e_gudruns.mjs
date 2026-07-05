// e2e_gudruns.mjs — E2E for the prompt-gen flow on a real lead.
// reconFull(gudrunsgoodies.dk) → buildClaudeCodePrompt → write prompt to disk.
//   node scripts/e2e_gudruns.mjs
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const imp = (p) => import(pathToFileURL(path.join(ROOT, "src", "lib", p)).href);

const { reconFull } = await imp("customer-recon-full.ts");
const { buildClaudeCodePrompt } = await imp("prompt-builder.ts");
const { templateForBranch } = await imp("design-templates.ts");

const input = {
  name: "Guðrun's Goodies",
  branch: "café",
  websiteUrl: "https://www.gudrunsgoodies.dk/",
  gmbUrl: undefined,
  igNotes: "Icelandic café, Copenhagen (Sankt Peders Stræde 35). Hyggelig hjemlig stemning, islandske kager/brunch, vegansk-venligt, varmt og personligt brand.",
};

console.log("→ recon…");
const recon = await reconFull(input);
console.log(JSON.stringify({
  source: recon.sources, title: recon.title, desc: recon.description,
  palette: recon.palette, headings: recon.headings.slice(0, 8),
  images: recon.images.slice(0, 8), tone: (recon.toneSample || "").slice(0, 160),
  notes: recon.notes,
}, null, 2));

const template = templateForBranch(input.branch);
const prompt = buildClaudeCodePrompt(
  { name: input.name, branch: input.branch, slug: recon.slug, websiteUrl: input.websiteUrl },
  recon, template, "7025dbb",
);

const out = path.join(ROOT, ".send_queue", "dispatch_gudruns.md");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, prompt, "utf-8");
console.log(`\n→ template: ${template.slug} (${template.label})`);
console.log(`→ prompt: ${prompt.length} chars → ${out}`);

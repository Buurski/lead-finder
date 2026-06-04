#!/usr/bin/env node
/*
 * gen-design-docs.mjs — mirror the TS design templates (src/lib/design-templates.ts)
 * into KnowledgeOS/wiki/design/design-{slug}.md so they're browsable in Memory.
 * The TS file is the source of truth; re-run this after editing it.
 *
 *   node scripts/gen-design-docs.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const { DESIGN_TEMPLATES } = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "design-templates.ts")).href);

const outDir = path.join(REPO_ROOT, "KnowledgeOS", "wiki", "design");
fs.mkdirSync(outDir, { recursive: true });

for (const t of DESIGN_TEMPLATES) {
  const md = `# Design-template — ${t.label}

> Auto-genereret fra src/lib/design-templates.ts. Rediger TS-filen, ikke denne.

## Typografi
- Display: **${t.typography.display}**
- Brødtekst: **${t.typography.body}**
- ${t.typography.note}

## Palet
- bg \`${t.palette.bg}\`
- ink \`${t.palette.ink}\`
- accent \`${t.palette.accent}\` (ink: \`${t.palette.accentInk}\`)
- ${t.palette.note}

## Sektion-rækkefølge
${t.sectionOrder.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Inspiration
${t.inspiration.map((s) => `- ${s}`).join("\n")}

## Anti-references
${t.antiReferences.map((s) => `- ${s}`).join("\n")}
`;
  fs.writeFileSync(path.join(outDir, `design-${t.slug}.md`), md, "utf-8");
}

console.log(`wrote ${DESIGN_TEMPLATES.length} design docs to KnowledgeOS/wiki/design/`);

// client-notes.ts — keep a markdown note per client in the vault
// (KnowledgeOS/wiki/kunder/{slug}.md). Created automatically when a lead becomes
// a client, then hand-editable. Frontmatter carries the deliverable metadata the
// /clients/[id] screen surfaces (cms_url, domain, next maintenance, project URL).
//
// Writes are local + best-effort: on a read-only filesystem (Vercel) this simply
// no-ops with a reason, and the vault stays the source of truth via Git/Obsidian.

import fs from "node:fs";
import path from "node:path";

import { slugify } from "./customer-recon.ts";

const KUNDER_DIR = path.join(process.cwd(), "KnowledgeOS", "wiki", "kunder");

export interface ClientLike {
  name: string;
  branch?: string;
  phone?: string;
  monthlyFee?: string;
  setupFee?: string;
  projectFolder?: string;
}

export function clientSlug(name: string): string {
  return slugify(name);
}

// Eksplicitte note-overrides: navne der ikke kan slugges til det faktiske
// filnavn i wiki/kunder/. (VIDA's kanoniske navn slugger til "vida-skoenhedsklinik",
// men noten hedder kunde-info-vida.md; KT VVS → ktvvs.md.)
const NOTE_OVERRIDES: Record<string, string> = {
  "VIDA Skønhedsklinik": "kunde-info-vida",
  "KT VVS": "ktvvs",
};

export function clientNoteFile(name: string): string {
  return NOTE_OVERRIDES[name.trim()] ?? clientSlug(name);
}

export function clientNoteRel(name: string): string {
  return `wiki/kunder/${clientNoteFile(name)}.md`;
}

function template(c: ClientLike): string {
  const today = new Date().toISOString().slice(0, 10);
  return `---
title: ${c.name}
type: kunde
status: aktiv
oprettet: ${today}
domain:
cms_url:
project_url: ${c.projectFolder ?? ""}
maanedspris: ${c.monthlyFee ?? ""}
setup: ${c.setupFee ?? ""}
naeste_vedligehold:
---

# ${c.name}

${c.branch ? `**Branche:** ${c.branch}` : ""}

## Aftale
- Setup: ${c.setupFee || "—"} · Måned: ${c.monthlyFee || "—"}

## Leverancer
- [ ] Demo godkendt
- [ ] Side live
- [ ] SEO-grundopsætning
- [ ] Overdraget (kunden ejer koden)

## Noter
(skriv løbende her — status, ønsker, vedligehold)

## Design
${c.branch ? `Branche-design: [[design-${c.branch.toLowerCase().replace(/[^a-zæøå0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "")}]]` : "Branche-design: (branch ikke registreret)"}
Site-design: [[sites/${clientSlug(c.name)}]] (når demo bygget)

## Kontaktlog
- ${today}: (første kontakt / status)

## Ønsker
(kundens ønsker til sitet — farver, sider, funktioner)

## Vedligehold
(historik: hvad er lavet hvornår)
`;
}

export interface EnsureResult {
  ok: boolean;
  rel: string;
  created: boolean;
  reason?: string;
}

// Create the note if it doesn't exist. Never overwrites an existing note.
export function ensureClientNote(c: ClientLike): EnsureResult {
  const rel = clientNoteRel(c.name);
  const abs = path.join(process.cwd(), "KnowledgeOS", "wiki", "kunder", `${clientNoteFile(c.name)}.md`);
  try {
    if (fs.existsSync(abs)) return { ok: true, rel, created: false };
    fs.mkdirSync(KUNDER_DIR, { recursive: true });
    fs.writeFileSync(abs, template(c), "utf-8");
    return { ok: true, rel, created: true };
  } catch (err) {
    return { ok: false, rel, created: false, reason: String(err) };
  }
}

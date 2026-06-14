# Studio + Demo-Factory Overnight Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. After EACH work-package: run `npm run build`, fix any error, then `git add` + commit on branch `feat/studio-overnight`. NEVER push/deploy. Commit-only.

**Goal:** Make `/studio` actually work end-to-end (build a demo → view it → it persists & shows in the grid), make generated demos visually DISTINCT per branch (stop "de bliver ens"), and produce a loose/varied per-site Design MD for Vida + every real deployed site, plus a reusable Skabelon and richer client-notes.

**Architecture:** Next.js 16 App Router + React 19. Demo factory = pure string composition (`src/lib/demo-factory.ts`) blending a per-branch `DesignTemplate` (`src/lib/design-templates.ts`) with customer recon (`src/lib/customer-recon.ts`). Storage abstraction `src/lib/store.ts` (FS locally → dist/, Blob+KV on Vercel). The Studio UI lives in `src/app/studio/`.

**Tech Stack:** TypeScript, Next 16 (Turbopack), React 19, node test scripts (`scripts/*.mjs`), Google Fonts, OKLCH palettes.

**Branch:** `feat/studio-overnight` (cut from current HEAD). Leave the 2 pre-existing unrelated dirty files (`.claude/scheduled_tasks.lock`, `scripts/send_brief_mail.mjs`) UNSTAGED — never commit them.

---

## ROOT-CAUSE FINDINGS (verified during exploration)

1. **Studio "doesn't work":** `FSStore.putAsset` returns `/_assets/${key}` (store.ts:115) but **NO route serves `/_assets/`** anywhere in the repo (grep confirms only store.ts mentions it). So a built demo's `demoPath` 404s — you can build it (inline `srcDoc` preview works) but can never open/revisit it, and `StudioGrid` only lists hardcoded external `DEMO_CATALOG` URLs, so built demos never appear. **Fix = WP-A.**
2. **"De bliver ens":** `composeHtml` (demo-factory.ts:77) renders ONE fixed HTML skeleton for every branch; only fonts/colors/section-labels swap. Every demo has identical layout. **Fix = WP-B (layout archetypes).**
3. **"Vida Design MD + other websites":** the 10 real deployed sites live in `DEMO_SITES` (demos.ts:12). No per-site design doc exists. **Fix = WP-C.**
4. **"Branche Design MD" / "Flere kundenoter":** branch MDs auto-gen from templates via `scripts/gen-design-docs.mjs` → `KnowledgeOS/wiki/design/*.md`; client notes in `client-notes.ts`. **Refresh = WP-D.**

## DESIGN DECISIONS (made autonomously — Lucas asleep, asked for full autonomy)

- **One stable demo URL everywhere:** `/demo/{slug}`. A Route Handler resolves it: on Vercel → `store.getAssetUrl` returns the Blob https URL → 302 redirect; locally → read `dist/demos/{slug}/index.html` and return as `text/html`. `demo-factory` returns `demoPath = "/demo/" + slug`.
- **Distinct layouts via `layout` archetype** added to `DesignTemplate`, not a rewrite per site. 5 archetypes cover all 7 branches: `gallery` (foto), `service` (vvs), `menu` (restaurant), `booking` (frisor/salon), `clinic` (hudpleje), `authority` (advokat). "Loose" = each archetype varies hero shape, section composition, nav, and accent treatment.
- **Per-site Design MD** written to `KnowledgeOS/wiki/design/sites/{slug}.md` by a new script `scripts/gen-site-design-docs.mjs` that recons each `DEMO_SITES` URL with a richer extractor (fonts + palette + layout signals). Kept varied by deriving from each site's REAL recon, not a fixed template.
- **Skabelon** = `KnowledgeOS/wiki/design/_skabelon.md` (human template for writing a new site/branch design MD by hand).
- **Test mail target** stays `buur.aigro@gmail.com` only. Engine never sends. No deploy.

---

## WP-A: Make built demos viewable + persistent + listed in Studio

**Files:**
- Create: `src/app/demo/[slug]/route.ts` (serves a built demo by slug)
- Create: `src/app/api/studio/list/route.ts` (lists built demos)
- Modify: `src/lib/demo-factory.ts:236` (return clean `demoPath = "/demo/"+slug`)
- Modify: `src/lib/store.ts` (add `listAssets(prefix)` so we can enumerate built demos in both FS and KV/Blob)
- Modify: `src/app/studio/StudioGrid.tsx` (add "Byggede demoer" section fed by `/api/studio/list`)
- Test: `scripts/test_studio_serve.mjs` (node, offline, STORE_DRIVER=fs)

- [ ] **A1 — Read Next 16 route-handler docs.** Before writing any route, read `node_modules/next/dist/docs/` for App Router Route Handlers (dynamic params are async in Next 16: `{ params }: { params: Promise<{ slug: string }> }`). Confirm the exact signature.

- [ ] **A2 — Add `listAssets` to the Store interface + all drivers.**
  - `store.ts` interface: add `listAssets(prefix: string): Promise<string[]>;` (returns asset keys, e.g. `demos/{slug}/index.html`).
  - FSStore: walk `dist/<prefix>` recursively, return keys relative to `dist/`.
  - InMemoryStore: filter `this.assets` keys by prefix.
  - BlobStore/ComposedStore: `const { list } = await this.blob(); list({ prefix })` → map `blobs[].pathname`.
  - Add to the `store` facade at bottom.

- [ ] **A3 — Test asset listing (write failing test first).** `scripts/test_studio_serve.mjs`: set `process.env.STORE_DRIVER='fs'`, import `store`, `putAsset('demos/test-x/index.html', '<h1>hi</h1>', 'text/html')`, assert `listAssets('demos/')` includes `demos/test-x/index.html`. Run `node scripts/test_studio_serve.mjs` → expect FAIL (listAssets undefined). Then implement A2 → expect PASS.

- [ ] **A4 — `GET /demo/[slug]` route.** Resolve `slug` (await params). `const key = \`demos/${slug}/index.html\`; const url = await store.getAssetUrl(key);`
  - If `url` starts with `http` → `return Response.redirect(url, 302)`.
  - Else read `path.join(process.cwd(),'dist',key)`; if exists return `new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}})`; else 404 `new Response('demo ikke fundet', {status:404})`.
  - `export const dynamic = "force-dynamic"`.

- [ ] **A5 — `demo-factory` returns the clean path.** demo-factory.ts: after `store.putAsset(...)`, set `demoPath = "/demo/" + slug;` (NOT `asset.url`). Keep writing the asset (so the route can serve it). Update the `DemoBuild.demoPath` doc comment.

- [ ] **A6 — `GET /api/studio/list`.** Returns `{ ok:true, demos:[{slug,url:"/demo/"+slug}] }` by calling `store.listAssets("demos/")`, extracting slug from `demos/{slug}/index.html`, deduping.

- [ ] **A7 — StudioGrid shows built demos.** Add a `useEffect` fetch of `/api/studio/list`; render a "Byggede demoer" row above/below the catalog, each card linking to `/demo/{slug}` (target _blank). Empty state: hide the section if none. Keep existing catalog intact.

- [ ] **A8 — Build + manual verify.** `npm run build` (expect exit 0). Then `STORE_DRIVER=fs PORT=3939 npx next start` in background; POST to `/api/studio/build-demo` `{name:"Test Salon",branch:"salon"}`; GET `/demo/test-salon` → expect HTML 200; GET `/api/studio/list` → includes `test-salon`. Stop the server. (Use browser-harness or curl.)

- [ ] **A9 — Commit.** `git add` the WP-A files only → `git commit -m "fix(studio): serve + list built demos via /demo/[slug] (was 404 /_assets)"`.

---

## WP-B: Distinct per-branch layouts (kill "de bliver ens")

**Files:**
- Modify: `src/lib/design-templates.ts` (add `layout` field + value per template)
- Modify: `src/lib/demo-factory.ts` (branch `composeHtml` by `t.layout`)
- Test: `scripts/test_demo_layouts.mjs` (node, offline)

- [ ] **B1 — Add `layout` to `DesignTemplate`.** `layout: "gallery" | "service" | "menu" | "booking" | "clinic" | "authority";` Assign: frisor→booking, salon→booking, restaurant→menu, vvs→service, hudpleje→clinic, foto→gallery, advokat→authority. (booking shared by frisor+salon but their palette/fonts already differ — vary the hero copy slot too.)

- [ ] **B2 — Write failing test.** `scripts/test_demo_layouts.mjs`: build a demo for each of the 7 branches (name only, empty recon via a stub `ReconResult`), assert the produced HTML differs structurally between archetypes — e.g. `gallery` HTML contains a full-bleed `.fullgallery` and NO sticky service phone bar; `service` contains a `tel:`/`ring` CTA block; `menu` contains a `.menu` list; `clinic` contains a trust/`certificer` block; `authority` contains a profile block. Assert `composeHtml(salon)` !== `composeHtml(vvs)` beyond color swaps (compare stripped-of-color skeletons differ). Run → expect FAIL.

- [ ] **B3 — Refactor `composeHtml`** into a shared `<head>`/shell + a `renderBody(layout, name, t, recon)` switch. Each archetype emits a genuinely different `<main>`:
  - `gallery`: full-bleed image grid hero, minimal nav, about + packages below.
  - `service`: sticky phone CTA bar, coverage-area block, services grid, akut/vagt callout.
  - `menu`: hero stemning image + "dagens/menu" list + book-bord CTA.
  - `booking`: hero with a booking card (behandlinger + priser cards), gallery, reviews.
  - `clinic`: calm hero + treatments + trust/certificering strip + before/after.
  - `authority`: serif hero + ydelsesområder + personal profile + contact.
  Keep all existing safety (esc, real recon snippets, skip-empty-sections). Reuse `renderGallery`/`renderSections` where sensible but differentiate per archetype.

- [ ] **B4 — Run test → expect PASS.** `node scripts/test_demo_layouts.mjs`.

- [ ] **B5 — Visual check.** Rebuild demos for salon, vvs, restaurant, foto via the running server (or call `buildDemo` in a node script writing to dist/), open each `/demo/{slug}`, screenshot, confirm visibly different layouts. Use browser-harness for screenshots.

- [ ] **B6 — Build + commit.** `npm run build`; `git commit -m "feat(demo-factory): distinct layout archetype per branch (gallery/service/menu/booking/clinic/authority)"`.

---

## WP-C: Per-site Design MDs (Vida + all real sites) + Skabelon

**Files:**
- Create: `scripts/gen-site-design-docs.mjs` (recon each DEMO_SITES url → design MD)
- Create: `KnowledgeOS/wiki/design/_skabelon.md` (hand-authoring template)
- Create: `KnowledgeOS/wiki/design/sites/{slug}.md` (one per site, generated)
- Reads: `src/lib/customer-recon.ts`, `src/lib/demos.ts`

- [ ] **C1 — Write `_skabelon.md`** by hand: a loose template with sections (Identitet, Typografi, Palet, Layout-arketype, Sektioner, Tone, Hvad gør den IKKE / anti-references, Genbrug til). Prose + fill-in blanks, explicitly noting "hold den løs — to sites må aldrig blive ens".

- [ ] **C2 — `gen-site-design-docs.mjs`:** import `DEMO_SITES` from `src/lib/demos.ts` and `reconCustomer` from `src/lib/customer-recon.ts`. For each `[key,url]`: run recon (network), plus a richer extract (regex the fetched HTML for `font-family`, Google Fonts `family=` params, button radius, hero structure). Compose a DISTINCT design MD per site (vary the prose/order by what recon actually found — never a fixed boilerplate). Write `KnowledgeOS/wiki/design/sites/{slug}.md`. Print a summary table (site → fonts → top colors → layout guess). Skip-and-note any site that fails recon (don't crash the batch).

- [ ] **C3 — Run it.** `node scripts/gen-site-design-docs.mjs`. Verify Vida (`vida`) doc is written and is materially different from e.g. `ktvvs` and `zaytoon`. Read 3 of them to confirm they're loose/distinct, not clones.

- [ ] **C4 — Commit.** `git add KnowledgeOS/wiki/design scripts/gen-site-design-docs.mjs` → `git commit -m "feat(design): per-site Design MD for all real sites + Skabelon template"`.

---

## WP-D: Refresh Branche Design MDs + richer client-notes ("Flere kundenoter")

**Files:**
- Modify: `scripts/gen-design-docs.mjs` (include the new `layout` field in output)
- Regenerate: `KnowledgeOS/wiki/design/design-*.md`
- Modify: `src/lib/client-notes.ts` (richer template: add Design-MD link, kontaktlog, ønsker/wishlist, vedligeholdshistorik)
- Test: `node scripts/test_all.mjs` must stay green (112 checks)

- [ ] **D1 — Read `scripts/gen-design-docs.mjs`**, add the `layout` archetype line to each generated branch MD. Run it; confirm `design-*.md` regenerated with the layout line.

- [ ] **D2 — Enrich `client-notes.ts` template:** add to the markdown body a `## Design` section linking the branch + (if exists) per-site design MD, a `## Kontaktlog`, a `## Ønsker` list, and `## Vedligehold`-historik. Keep frontmatter + `ensureClientNote` signature unchanged (never overwrites existing notes).

- [ ] **D3 — Regression.** `node scripts/test_all.mjs` → expect all green. `npm run build` → exit 0.

- [ ] **D4 — Commit.** `git commit -m "feat(notes+design): layout in branche MDs, richer client-note template"`.

---

## WP-E: End-to-end demo from a real lead

- [ ] **E1 — Pick a real lead.** Read `.send_queue/approval_queue.json` (or `node .send_queue/_find_vida.mjs` style) / Sheets is not reachable offline — use a name+branch from the queue or a known lead. Prefer a NON-food, beauty/service lead (per lead-targeting memory). Record name+branch+url.
- [ ] **E2 — Build via Studio API** (server running, STORE_DRIVER=fs): POST `/api/studio/build-demo` with that lead. Expect `ok:true`. Open `/demo/{slug}`, screenshot.
- [ ] **E3 — Verify** the demo reflects the lead's branch layout + any recon data; confirm it appears in `/api/studio/list` and StudioGrid. Write findings to the plan's Progress Log.
- [ ] **E4 — Final build + commit** any fixups. Leave a Progress Log summary at bottom of this file.

---

## Progress Log

(Executor appends dated entries here after each WP: what passed, what was restarted, screenshots path.)

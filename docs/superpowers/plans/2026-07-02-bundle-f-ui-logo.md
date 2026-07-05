# Bundle F — Internt UI + logo + integrationer + polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) — autonomous session, max 2 subagents.

**Goal:** Gør Command Center hurtigere og mere behageligt for de to interne brugere (Lucas + Charlie), giv systemet en intern Buurski-identitet, land 2-3 salgs-nyttige integrationer, og bug-hunt på tværs af bundle A-E.

**Architecture:** Next.js 16 App Router. Design system = CSS-vars i `src/app/globals.css` (cc-* klasser, OKLch warm creme + sage). buur-cms = søster-repo med Sting-tema (beige + orange), samme fonte (Fraunces + Plus Jakarta Sans).

**Tech Stack:** Next.js 16, React 19, lucide-react (eneste ikon-lib), inline cc-* klasser, ingen tailwind.config (Tailwind v4 vars).

## Global Constraints

- **SCOPE-KLARING fra Lucas:** CC er INTERNT operatør-værktøj. Effektivitet over polish. Ingen onboarding-flows, ingen wow-animationer, rå og hurtig OK. Logo = intern identitet, ALDRIG kunde-synlig. Kunde-polish hører til buur-cms' kunde-flader.
- Branch: `feat/bundle-f-ui-logo-2026-07-02` (baseret på bundle-e HEAD @bbe9da1 — UI-arbejde skal ramme trimmet CC). Push, aldrig merge.
- buur-cms-arbejde: egen branch `feat/bundle-f-ui-logo-2026-07-02` baseret på `feat/bundle-b-cms-lite-2026-07-02` HEAD @37c456e.
- Aldrig `npm run dev`. Verifikation: `npm run build` + `node scripts/test_all.mjs` + curl på Vercel preview.
- Aldrig Vercel CLI. Kun git push (auth = shadowporo123).
- Ingen em-dashes/emojis/AI-fraser i DONE-doc.
- Council (3-lens: Opus 4.8 + Sonnet 5 + Haiku 4.5, linser A upside / B risici / C beskyt / D wildcard) efter hver stor del. Fable self-review af kode.
- Ingen mail til Lucas — synthesizer-session samler.

## Recon-fakta (2026-07-02)

- lead-system: kun lucide-react (Icon.tsx map, 37 ikoner); ad-hoc emoji-status i sider. Kun 4 `.cc-empty` (leadgen/messenger/replies/seo). Ingen Button-komponent, men konsistent `.cc-btn`/`.cc-btn-accent`. Favicon = gammel 25.9KB .ico. Brand = `.cc-brand-mark` CSS-boks, title "Command Center". Ingen docs/brand/.
- buur-cms: INGEN favicon/logo, title "buur-cms" (generisk), Sting-palette (#F4F1EB bg, #D4500F accent, #C8A97E gold), samme fonte. Stripe-stub (subscriptionStatus + isSiteActive-gate) uden checkout-UI. Ingen Cal.com.
- Bundle-branches: A (hygiene), C (seo-tjek), E (cc-trim) her; B (cms-lite) i buur-cms; D = docs/sales/ (untracked her).

---

### Del 1: Internt CC-UI (effektivitet + konsistens)

**Files:**
- Modify: `src/app/globals.css` (evt. manglende tokens, focus-states, loading-states)
- Modify: `src/app/leads/*`, `src/app/approve/*`, `src/app/clients/*`, `src/app/goals/*`, `src/app/studio/*` (empty-states)
- Modify: sider med emoji-status → `Icon`-komponent hvor billigt
- Modify: sider med >1 `cc-btn-accent` per view (dedupe primær-CTA)

**Steps:**
- [ ] Audit: grep alle sider for `cc-btn-accent` (dobbelt-CTA per view), emoji-statusser, manglende empty-states
- [ ] Empty-states på /leads, /approve, /clients (+ /goals, /studio hvis tomme-tilstand reelt kan opstå): Icon + heading + subtext i eksisterende `.cc-empty`-mønster. Ingen illustrationer.
- [ ] Ensret status-indikatorer: emoji → lucide via Icon.tsx hvor det er ren substitution
- [ ] Micro-feedback KUN hvor det sparer tid: knappe-loading (disabled + spinner) og success-flash på godkend/afvis i /approve og send-handlinger; genbrug eksisterende mønstre
- [ ] Mobile-pass: sidebar-adfærd, tabel-overflow (overflow-x auto), touch-targets på /approve + /replies + /leads (siderne Lucas bruger på telefon)
- [ ] `npm run build` grøn + `node scripts/test_all.mjs` grøn
- [ ] Commit pr. logisk klump
- [ ] COUNCIL 1 (3-lens) → inkorporér fund → self-review

### Del 2: Intern Buurski-identitet

**Files:**
- Create: `docs/brand/BRAND.md`, `docs/brand/logo-*.svg` (2-3 varianter)
- Create: `src/app/icon.svg` (Next 16 favicon-konvention) — erstatter gammel favicon.ico
- Modify: `src/components/shell/*` (cc-brand-mark → SVG-mark)
- buur-cms: KUN /master (admin, Lucas-facing) får mark; kunde-editor røres IKKE

**Steps:**
- [ ] Design 2-3 SVG-varianter (mark + ordbillede, ren tekst, mono-mark). Håndlavet SVG, warm palette (sage + creme her / genkendelig på tværs). canvas-design skill hvis nyttig
- [ ] Brand-tokens i docs/brand/BRAND.md: 3-4 farver, 2 fonte (Fraunces + Plus Jakarta Sans, allerede delt), signatur-form
- [ ] Implementér: icon.svg favicon, brand-mark i sidebar, title-metadata
- [ ] COUNCIL 2 (hurtig, 3-lens) → inkorporér → self-review

### Del 3: Integrationer (2-3, salgs-nytte først)

Prioriteret kandidatliste (afgøres endeligt efter audit af bundle-c funnel):
1. **Cal.com booking-link** i SEO-tjek-CTA + follow-up mail (bundle-c). Env `CALCOM_URL`, graceful fallback til mailto. Direkte salgsnytte: booket møde > mail-pingpong.
2. **Stripe basis færdig** i buur-cms (bundle-b stub → checkout-session + webhook-opdatering af subscriptionStatus). Kunde-facing = kunde-grade.
3. **Google reviews-blok** i SEO-tjek-rapporten (Places API allerede i huset) — social proof i rapporten, nul ny auth.

**Steps:**
- [ ] Audit bundle-c seo-tjek funnel + bundle-b stripe-stub; bekræft valg (afvig hvis bedre findes)
- [ ] Implementér 2-3 med env-guards (mangler nøgle ⇒ feature skjult, aldrig crash)
- [ ] Tests: test_all.mjs udvides hvor lib-kode tilføjes
- [ ] COUNCIL 3 → inkorporér → self-review

### Del 4: Bug-hunt + konsistens på tværs af bundle A-E

**Steps:**
- [ ] 2 parallelle reviewers: (1) bundle-a+e diff-review (denne repo), (2) bundle-b (buur-cms) + bundle-c diff-review
- [ ] Konsistens-tjek mod docs/sales/ priser (web 5-15k, SEO 2.500+750/md intro, CMS 495-1.495) + tone + kunde-benævnelser på tværs af seo-tjek-tekster, billing-plan, onepagers
- [ ] Fix fund her + i buur-cms (hver på sin bundle-f branch)
- [ ] COUNCIL 4 (final) → inkorporér

### Afslutning

- [ ] `npm run build` + test_all.mjs grøn begge repos
- [ ] Push begge branches
- [ ] `docs/bundles/bundle-f-DONE.md`: resumé, preview-URL, logo-billeder, integrations-liste

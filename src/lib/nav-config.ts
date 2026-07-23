// nav-config.ts — single source of truth for the command-center IA.
// Consumed by the sidebar AND the ⌘K command palette so they never drift.

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide-react icon name (resolved in the component)
  hint?: string; // shown in the command palette
  /** Label used in the ⌘K palette when the sidebar label alone is ambiguous
   *  (e.g. "Email" under both Godkendelse and Svar). Falls back to label. */
  paletteLabel?: string;
  badge?: "queue" | "needs"; // dynamic count slot, filled by the shell
  soon?: boolean; // placeholder surface, not built yet
}

export interface NavNode extends NavItem {
  /** Sub-items — renders as an accordion dropdown in the sidebar. The parent
   *  row toggles open/closed; only children navigate. Parent `href` is the
   *  primary child (used for active-detection fallback), never a link. */
  children?: NavItem[];
}

// Nav-model A (Bundle G, 2026-07-03): dropdown-based sidebar. /radar er en
// coming-soon-side (den rigtige ligger på branch archive/thin-pages-2026-07-02).
// SMS er død (samme archive-branch) — Godkendelse har derfor 2 kanaler.
// "Alle kanaler" er droppet: /approve ER den samlede kø, et duplikat-link
// ville bare pege samme sted som Email.
export const NAV_TREE: NavNode[] = [
  { href: "/", label: "Mission Control", icon: "LayoutDashboard", hint: "Dagens overblik" },
  {
    href: "/approve",
    label: "Godkendelse",
    icon: "CheckCheck",
    badge: "queue",
    children: [
      { href: "/approve", label: "Email", paletteLabel: "Godkendelse · Email", icon: "Mail", hint: "Drafts i kø", badge: "queue" },
      { href: "/messenger", label: "Messenger", paletteLabel: "Godkendelse · Messenger", icon: "MessageSquare", hint: "FB-drafts, marker sendt" },
    ],
  },
  {
    href: "/replies",
    label: "Svar",
    icon: "Inbox",
    badge: "needs",
    children: [
      { href: "/replies", label: "Email-indbakke", icon: "Mail", hint: "Indbakke-triage", badge: "needs" },
      { href: "/messenger", label: "Messenger-indbakke", icon: "MessageSquare", hint: "FB-svar håndteres på Messenger-siden" },
    ],
  },
  {
    href: "/leads",
    label: "Leads",
    icon: "Users",
    children: [
      { href: "/leads", label: "Pipeline", paletteLabel: "Leads · Pipeline", icon: "Users", hint: "Pipeline" },
      { href: "/leadgen", label: "Leadgen", icon: "Radar", hint: "Find nye leads" },
      { href: "/radar", label: "Radar", icon: "Rss", hint: "AI-radar (kommer snart)", soon: true },
    ],
  },
  { href: "/clients", label: "Klienter", icon: "Briefcase", hint: "Aktive kunder" },
  {
    href: "/okonomi",
    label: "Forretning",
    icon: "CircleDollarSign",
    children: [
      { href: "/okonomi", label: "Økonomi", paletteLabel: "Forretning · Økonomi", icon: "Target", hint: "Forecast & mål" },
      { href: "/fakturaer", label: "Fakturaer", icon: "Receipt", hint: "Kladder, afsendelse & status" },
      { href: "/udgifter", label: "Udgifter", icon: "Wallet", hint: "Abonnementer, split & overførsler" },
      { href: "/salg", label: "Salg", icon: "Workflow", hint: "Vægtet deal-pipeline" },
      { href: "/indsigter", label: "Indsigter", icon: "Activity", hint: "Indtjening & trends" },
    ],
  },
  {
    href: "/seo",
    label: "SEO",
    icon: "Search",
    children: [
      { href: "/seo", label: "Overblik", paletteLabel: "SEO · Overblik", icon: "Search", hint: "Søgning pr. klient" },
      { href: "/seo-tjek", label: "Gratis SEO-tjek", icon: "Gauge", hint: "Offentlig SEO-tjek-tragt" },
    ],
  },
  {
    href: "/studio",
    label: "Studio",
    icon: "LayoutGrid",
    children: [
      { href: "/studio", label: "Demoer", paletteLabel: "Studio · Demoer", icon: "LayoutGrid", hint: "Demoer & klient-sites" },
      { href: "/studio/compare", label: "Compare", paletteLabel: "Studio · Compare", icon: "Columns2", hint: "Side-om-side sammenligning" },
      { href: "/studio/prompt-gen", label: "Prompt-gen", paletteLabel: "Studio · Prompt-gen", icon: "Wand", hint: "Recon → prompt → dispatch" },
    ],
  },
  {
    href: "/claude",
    label: "Værktøjer",
    icon: "Wrench",
    children: [
      { href: "/claude", label: "Claude", icon: "Bot", hint: "Claude-chat" },
      { href: "/hermes", label: "Hermes", icon: "Sparkles", hint: "24/7-agent på VPS" },
      { href: "/goals", label: "Goals", icon: "Target", hint: "90-dages mål (vault)" },
    ],
  },
  { href: "/settings", label: "Indstillinger", icon: "Settings", hint: "Motor-kadence" },
];

// Flat list for the command palette + keyboard nav: leaves only (a parent's
// own href always duplicates its primary child). Dedup pr. href+label — IKKE
// kun href: samme destination under to forældre ("Godkendelse · Messenger" og
// "Svar · Messenger-indbakke") skal begge kunne findes i paletten, ellers
// rammer en søgning på "svar messenger" ingenting (council-fund, Bundle G).
export const NAV_FLAT: NavItem[] = (() => {
  const seen = new Set<string>();
  const out: NavItem[] = [];
  for (const node of NAV_TREE) {
    const leaves = node.children ?? [node];
    for (const leaf of leaves) {
      const key = `${leaf.href}|${leaf.paletteLabel ?? leaf.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(leaf);
    }
  }
  return out;
})();

// Back-compat: a couple of tests/components import NAV (grouped). Keep a thin
// alias so nothing breaks while the tree is the real source of truth.
export const NAV = NAV_TREE;

// ---- Delte hjælpere (sidebar + breadcrumbs) --------------------------------

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Ejer-gruppe for en rute: først gruppen hvis EGEN href er prefix af stien
 *  (Studio ejer /studio/compare selvom SEO også linker dertil), ellers første
 *  gruppe med et aktivt barn. Delte hrefs må hverken folde to sektioner ud
 *  eller give tvetydige breadcrumbs (council-fund B1/B2, Bundle G). */
export function ownerGroupFor(pathname: string): NavNode | null {
  for (const node of NAV_TREE) {
    if (node.children && isNavActive(pathname, node.href)) return node;
  }
  for (const node of NAV_TREE) {
    if (node.children && node.children.some((c) => isNavActive(pathname, c.href))) return node;
  }
  return null;
}

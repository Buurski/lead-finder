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
  hidden?: boolean; // reachable in ⌘K, but intentionally not in the primary rail
}

export interface NavNode extends NavItem {
  /** Sub-items — renders as an accordion dropdown in the sidebar. The parent
   *  row toggles open/closed; only children navigate. Parent `href` is the
   *  primary child (used for active-detection fallback), never a link. */
  children?: NavItem[];
}

// Kinly Lead System IA: the rail answers what Lucas and Charlie use daily.
// Legacy/experimental routes remain reachable directly and through ⌘K, but do
// not compete with the daily work surfaces.
export const NAV_TREE: NavNode[] = [
  { href: "/", label: "I dag", icon: "LayoutDashboard", hint: "Dagens overblik" },
  {
    href: "/approve",
    label: "Arbejde",
    icon: "Inbox",
    badge: "queue",
    children: [
      { href: "/approve", label: "Godkendelse", paletteLabel: "Arbejde · Godkendelse", icon: "CheckCheck", hint: "Drafts i kø", badge: "queue" },
      { href: "/leads", label: "Pipeline", paletteLabel: "Arbejde · Pipeline", icon: "Users", hint: "Lead-pipeline" },
      { href: "/leadgen", label: "Gratis udkast", paletteLabel: "Arbejde · Gratis udkast", icon: "Radar", hint: "Find leads og lav gratis udkast" },
      { href: "/replies", label: "Svar", icon: "Mail", hint: "Svar der kræver dig", badge: "needs" },
    ],
  },
  { href: "/clients", label: "Kunder & sites", icon: "Briefcase", hint: "Aktive kunder og sites" },
  {
    href: "/seo",
    label: "Synlighed",
    icon: "Search",
    children: [
      { href: "/seo", label: "SEO-overblik", paletteLabel: "Synlighed · SEO-overblik", icon: "Search", hint: "Søgning pr. kunde" },
      { href: "/seo-tjek", label: "Gratis SEO-tjek", icon: "Gauge", hint: "Offentlig SEO-tjek-tragt", hidden: true },
      { href: "/studio", label: "Studio", icon: "LayoutGrid", hint: "Demoer og kunde-sites" },
    ],
  },
  {
    href: "/okonomi",
    label: "Forretning",
    icon: "CircleDollarSign",
    children: [
      { href: "/okonomi", label: "Økonomi", paletteLabel: "Forretning · Økonomi", icon: "Target", hint: "Forecast & mål" },
      { href: "/fakturaer", label: "Fakturaer", icon: "Receipt", hint: "Kladder, afsendelse & status" },
      { href: "/salg", label: "Salg", icon: "Workflow", hint: "Vægtet deal-pipeline" },
      { href: "/udgifter", label: "Udgifter", icon: "Wallet", hint: "Abonnementer, split & overførsler" },
      { href: "/indsigter", label: "Indsigter", icon: "Activity", hint: "Indtjening & trends" },
    ],
  },
  {
    href: "/hermes",
    label: "Hjernen",
    icon: "Sparkles",
    children: [
      { href: "/hermes", label: "Hermes", icon: "Sparkles", hint: "24/7-agent og ideer" },
      { href: "/goals", label: "Mål", icon: "Target", hint: "Aktive 90-dages mål", hidden: true },
      { href: "/settings", label: "Indstillinger", icon: "Settings", hint: "Motor-kadence og sikkerhed", hidden: true },
    ],
  },
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

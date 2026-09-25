// nav-config.ts — single source of truth for the Kinly HQ information
// architecture (fase 2, 2026-09-22). Consumed by the rail, the mobile bottom
// bar + "Mere"-sheet, the topbar page title, and the ⌘K command palette so
// they never drift.

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide-react icon name (resolved in Icon.tsx)
  hint?: string; // shown in the command palette
  badge?: "queue"; // dynamic count slot, filled by the shell (queue → Indbakke)
}

// The 7 rail icons (desktop) — same list opens as the top group of the
// mobile "Mere"-sheet. "Agenter" samler Hermes + Drift + agent-sessioner
// under /agenter (fase 2).
export const NAV_PRIMARY: NavItem[] = [
  { href: "/", label: "HQ", icon: "Home", hint: "Dagens overblik" },
  { href: "/kunder", label: "Kunder", icon: "Building2", hint: "Aktive kunder" },
  { href: "/opgaver", label: "Opgaver", icon: "ListChecks", hint: "Min dag, opgaver og næste skridt" },
  { href: "/pipeline", label: "Pipeline", icon: "Workflow", hint: "Deals og næste skridt" },
  { href: "/approve", label: "Indbakke", icon: "Inbox", hint: "Kladder til godkendelse", badge: "queue" },
  { href: "/leadgen", label: "Leadgen", icon: "Radar", hint: "Nye virksomheder" },
  { href: "/okonomi", label: "Økonomi", icon: "CircleDollarSign", hint: "Fakturaer, MRR og forecast" },
  { href: "/agenter", label: "Agenter", icon: "Sparkles", hint: "Hermes og sessioner" },
  { href: "/mit-rum", label: "Mit rum", icon: "NotebookPen", hint: "Dine private noter" },
];

// Reachable via ⌘K og mobilens "Mere"-ark, ikke i den faste rail.
export const NAV_MORE: NavItem[] = [
  { href: "/virksomheder", label: "Alle virksomheder", icon: "Building2", hint: "Alle virksomheder og leads" },
  { href: "/blog", label: "Blog", icon: "Rss", hint: "Blogindlæg: idé til udgivet" },
  { href: "/studio", label: "Studio", icon: "LayoutGrid", hint: "Demoer og kunde-sites" },
  { href: "/seo", label: "SEO", icon: "Search", hint: "Målinger og historik" },
  { href: "/indsigter", label: "Indsigter", icon: "Activity", hint: "Indtjening og trends" },
  { href: "/fakturaer", label: "Fakturaer", icon: "Receipt", hint: "Kladder, afsendelse og status" },
  { href: "/udgifter", label: "Udgifter", icon: "Wallet", hint: "Abonnementer og split" },
  { href: "/drift", label: "Drift", icon: "Server", hint: "Kanban, cron og agenter" },
  { href: "/previews", label: "Gratis udkast", icon: "LayoutGrid", hint: "Spørgeskemaer og demoer" },
  { href: "/replies", label: "Svar", icon: "Mail", hint: "Svar der kræver dig" },
  { href: "/messenger", label: "Messenger", icon: "MessagesSquare", hint: "Messenger-tråde" },
  { href: "/settings", label: "Indstillinger", icon: "Settings", hint: "Din konto, adgangskode og motoren" },
];

// Flad liste til ⌘K: hele IA'en, rail-item først.
export const NAV_FLAT: NavItem[] = [...NAV_PRIMARY, ...NAV_MORE];

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

// Topbar-titlen for den aktive side: bedste (længste) href-match i hele IA'en.
export function pageTitleFor(pathname: string): string {
  let best: NavItem | undefined;
  for (const item of NAV_FLAT) {
    if (isNavActive(pathname, item.href) && (!best || item.href.length > best.href.length)) {
      best = item;
    }
  }
  return best?.label ?? "Kinly HQ";
}

// ---- Sektioner: undersider som faner øverst (Lucas 22/9) ----
// Hver hovedside i railen kan have faner. Står man på en fane-side, er
// hovedpunktet i railen aktivt, og fanebjælken vises under topbar-titlen.

export interface Section {
  root: string; // rail-href der ejer sektionen
  tabs: Array<{ href: string; label: string }>;
}

export const SECTIONS: Section[] = [
  { root: "/kunder", tabs: [{ href: "/kunder", label: "Kunder" }, { href: "/virksomheder", label: "Alle virksomheder" }] },
  {
    root: "/approve",
    tabs: [
      { href: "/approve", label: "Godkend" },
      { href: "/replies", label: "Svar" },
      { href: "/previews", label: "Gratis udkast" },
      { href: "/messenger", label: "Messenger" },
      { href: "/kundeopdateringer", label: "Kundeopdateringer" },
    ],
  },
  {
    root: "/okonomi",
    tabs: [
      { href: "/okonomi", label: "Overblik" },
      { href: "/fakturaer", label: "Fakturaer" },
      { href: "/udgifter", label: "Udgifter" },
      { href: "/indsigter", label: "Indsigter" },
    ],
  },
  {
    root: "/agenter",
    tabs: [
      { href: "/agenter", label: "Oversigt" },
      { href: "/hermes", label: "Hermes" },
      { href: "/drift", label: "Drift" },
    ],
  },
  {
    root: "/leadgen",
    tabs: [
      { href: "/leadgen", label: "Find leads" },
      { href: "/studio", label: "Demoer" },
    ],
  },
];

function matches(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(href + "/");
}

export function sectionFor(pathname: string): Section | undefined {
  return SECTIONS.find((s) => s.tabs.some((t) => matches(pathname, t.href)));
}

/** Rail-punktet er aktivt på egen side OG på alle sektionens fane-sider. */
export function isRailActive(pathname: string, href: string): boolean {
  if (isNavActive(pathname, href)) return true;
  return sectionFor(pathname)?.root === href;
}

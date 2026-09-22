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
// mobile "Mere"-sheet. "Agenter" points at /hermes midlertidigt (fase 3
// samler /hermes + /drift under /agenter).
export const NAV_PRIMARY: NavItem[] = [
  { href: "/", label: "HQ", icon: "Home", hint: "Dagens overblik" },
  { href: "/pipeline", label: "Pipeline", icon: "Workflow", hint: "Deals og næste skridt" },
  { href: "/virksomheder", label: "Virksomheder", icon: "Building2", hint: "Kundeprofiler og sites" },
  { href: "/approve", label: "Indbakke", icon: "Inbox", hint: "Kladder til godkendelse", badge: "queue" },
  { href: "/leadgen", label: "Leadgen", icon: "Radar", hint: "Nye virksomheder" },
  { href: "/okonomi", label: "Økonomi", icon: "CircleDollarSign", hint: "Fakturaer, MRR og forecast" },
  { href: "/hermes", label: "Agenter", icon: "Sparkles", hint: "Hermes og sessioner" },
];

// Reachable via ⌘K og mobilens "Mere"-ark, ikke i den faste rail.
export const NAV_MORE: NavItem[] = [
  { href: "/studio", label: "Studio", icon: "LayoutGrid", hint: "Demoer og kunde-sites" },
  { href: "/seo", label: "SEO", icon: "Search", hint: "Søgning pr. kunde" },
  { href: "/indsigter", label: "Indsigter", icon: "Activity", hint: "Indtjening og trends" },
  { href: "/fakturaer", label: "Fakturaer", icon: "Receipt", hint: "Kladder, afsendelse og status" },
  { href: "/udgifter", label: "Udgifter", icon: "Wallet", hint: "Abonnementer og split" },
  { href: "/drift", label: "Drift", icon: "Server", hint: "Kanban, cron og agenter" },
  { href: "/previews", label: "Gratis udkast", icon: "LayoutGrid", hint: "Spørgeskemaer og demoer" },
  { href: "/replies", label: "Svar", icon: "Mail", hint: "Svar der kræver dig" },
  { href: "/messenger", label: "Messenger", icon: "MessagesSquare", hint: "Messenger-tråde" },
  { href: "/settings", label: "Indstillinger", icon: "Settings", hint: "Motor-kadence og sikkerhed" },
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

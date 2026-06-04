// nav-config.ts — single source of truth for the command-center IA.
// Consumed by the sidebar AND the ⌘K command palette so they never drift.

export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide-react icon name (resolved in the component)
  hint?: string; // shown in the command palette
  badge?: "queue" | "needs"; // dynamic count slot, filled by the shell
  soon?: boolean; // placeholder surface, not built yet
}

export interface NavGroup {
  id: "workspace" | "agents" | "self";
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { href: "/", label: "Mission Control", icon: "LayoutDashboard", hint: "Dagens overblik" },
      { href: "/leads", label: "Leads", icon: "Users", hint: "Pipeline" },
      { href: "/approve", label: "Godkendelse", icon: "CheckCheck", hint: "Drafts i kø", badge: "queue" },
      { href: "/replies", label: "Svar", icon: "Mail", hint: "Indbakke-triage" },
      { href: "/clients", label: "Klienter", icon: "Briefcase", hint: "Aktive kunder" },
    ],
  },
  {
    id: "agents",
    label: "Agents",
    items: [
      { href: "/claude", label: "Claude", icon: "Sparkles", hint: "Hjernen / byggeren" },
      { href: "/hermes", label: "Hermes", icon: "Radio", hint: "24/7 — kommer snart", soon: true },
      { href: "/spend", label: "AI Spend", icon: "CircleDollarSign", hint: "Forbrug pr. model" },
    ],
  },
  {
    id: "self",
    label: "Self",
    items: [
      { href: "/goals", label: "Goals", icon: "Target", hint: "90-dages mål" },
      { href: "/seo", label: "SEO", icon: "Search", hint: "Søgning pr. klient" },
      { href: "/studio", label: "Studio", icon: "LayoutGrid", hint: "Demoer & klient-sites" },
      { href: "/journal", label: "Journal", icon: "BookOpen", hint: "Daglige briefs" },
      { href: "/memory", label: "Memory", icon: "Brain", hint: "Second brain" },
      { href: "/build-guide", label: "Plan-historik", icon: "Map", hint: "Planen & systemet" },
      { href: "/settings", label: "Indstillinger", icon: "Settings", hint: "Motor-kadence" },
    ],
  },
];

// Flat list for the command palette + keyboard nav.
export const NAV_FLAT: NavItem[] = NAV.flatMap((g) => g.items);

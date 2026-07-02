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
  id: "workspace" | "self";
  label: string;
  items: NavItem[];
}

// Trimmet 2026-07-02 (Bundle E): 8 kerneflader. /leadgen, /messenger, /goals,
// /claude og /hermes findes stadig (direkte URL, ude af nav). /radar, /sms,
// /spend, /memory, /build-guide, /followup-review og /journal er SLETTET —
// de ligger på branch archive/thin-pages-2026-07-02.
export const NAV: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      { href: "/", label: "Mission Control", icon: "LayoutDashboard", hint: "Dagens overblik" },
      { href: "/approve", label: "Godkendelse", icon: "CheckCheck", hint: "Drafts i kø", badge: "queue" },
      { href: "/replies", label: "Svar", icon: "Mail", hint: "Indbakke-triage" },
      { href: "/leads", label: "Leads", icon: "Users", hint: "Pipeline" },
      { href: "/clients", label: "Klienter", icon: "Briefcase", hint: "Aktive kunder" },
    ],
  },
  {
    id: "self",
    label: "Self",
    items: [
      { href: "/seo", label: "SEO", icon: "Search", hint: "Søgning pr. klient" },
      { href: "/studio", label: "Studio", icon: "LayoutGrid", hint: "Demoer & klient-sites" },
      { href: "/settings", label: "Indstillinger", icon: "Settings", hint: "Motor-kadence" },
    ],
  },
];

// Flat list for the command palette + keyboard nav.
export const NAV_FLAT: NavItem[] = NAV.flatMap((g) => g.items);

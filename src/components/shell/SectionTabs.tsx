"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionFor } from "@/lib/nav-config";

// Fanebjælke for undersider (Indbakke, Økonomi, Agenter, Leadgen).
export default function SectionTabs() {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  if (!section) return null;
  return (
    <nav className="cc-section-tabs" aria-label="Undersider">
      {section.tabs.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + "/");
        return (
          <Link key={t.href} href={t.href} className="cc-section-tab" data-active={active} aria-current={active ? "page" : undefined}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

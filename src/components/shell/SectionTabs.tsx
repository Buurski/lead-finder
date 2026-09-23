"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { sectionFor } from "@/lib/nav-config";
import "./section-tabs.css";

// Fanebjælke for undersider (Indbakke, Økonomi, Agenter, Leadgen). Scroller
// vandret på smalle skærme (design-review #9) — diskret fade i højre kant når
// der er mere, og den aktive fane scrolles altid ind i syne ved sideskift.
export default function SectionTabs() {
  const pathname = usePathname();
  const section = sectionFor(pathname);
  const scrollRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [pathname]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    function check() {
      if (!el) return;
      setMore(el.scrollWidth - el.scrollLeft - el.clientWidth > 4);
    }
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [section]);

  if (!section) return null;
  return (
    <div className="cc-section-tabs-wrap" data-more={more}>
      <nav className="cc-section-tabs" aria-label="Undersider" ref={scrollRef}>
        {section.tabs.map((t) => {
          const active = pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              ref={active ? activeRef : undefined}
              className="cc-section-tab"
              data-active={active}
              aria-current={active ? "page" : undefined}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

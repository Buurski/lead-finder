"use client";
// Lokale faner på profilen (Overblik · Tidslinje · Aftaler · Fakturaer · Viden).
// Stylet som .cc-section-tabs-familien (fælles-regel #17), men egne — dette er
// undersider på ÉN virksomheds side, ikke en hovedside i railen.
// Charlie 23/9: på mobil klippede fanerækken "Fakturaer" og skjulte "Viden"
// helt — samme fiks som SectionTabs.tsx (vandret scroll + diskret fade i
// højre kant når der er mere, aktiv fane scrolles altid ind i syne).
import { useEffect, useRef, useState, type ReactNode } from "react";

export interface ProfileTab { key: string; label: string; content: ReactNode }

export default function ProfileTabs({ tabs }: { tabs: ProfileTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const scrollRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

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
  }, [tabs]);

  return (
    <div>
      <div className="cc-section-tabs-wrap virk-tabs-wrap" data-more={more}>
        <nav className="cc-section-tabs virk-tabs" aria-label="Virksomhedens sider" ref={scrollRef}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              ref={active === t.key ? activeRef : undefined}
              className="cc-section-tab"
              data-active={active === t.key ? "true" : undefined}
              aria-current={active === t.key ? "page" : undefined}
              onClick={() => setActive(t.key)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      {tabs.map((t) => (
        <div key={t.key} hidden={active !== t.key} className="virk-tab-panel">
          {t.content}
        </div>
      ))}
    </div>
  );
}

"use client";
// Lokale faner på profilen (Overblik · Tidslinje · Aftaler · Fakturaer · Viden).
// Stylet som .cc-section-tabs-familien (fælles-regel #17), men egne — dette er
// undersider på ÉN virksomheds side, ikke en hovedside i railen.
import { useState, type ReactNode } from "react";

export interface ProfileTab { key: string; label: string; content: ReactNode }

export default function ProfileTabs({ tabs }: { tabs: ProfileTab[] }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  return (
    <div>
      <nav className="cc-section-tabs virk-tabs" aria-label="Virksomhedens sider">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className="cc-section-tab"
            data-active={active === t.key ? "true" : undefined}
            aria-current={active === t.key ? "page" : undefined}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      {tabs.map((t) => (
        <div key={t.key} hidden={active !== t.key} className="virk-tab-panel">
          {t.content}
        </div>
      ))}
    </div>
  );
}

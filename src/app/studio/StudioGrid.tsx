"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";
import { DEMO_CATALOG } from "@/lib/demos";
import type { DemoEntry } from "@/lib/demos";

const BRANCHES: { id: DemoEntry["branch"] | "alle"; label: string }[] = [
  { id: "alle", label: "Alle" },
  { id: "mad", label: "Mad" },
  { id: "skønhed", label: "Skønhed" },
  { id: "håndværk", label: "Håndværk" },
  { id: "foto", label: "Foto" },
  { id: "service", label: "Service" },
];

export default function StudioGrid() {
  const [filter, setFilter] = useState<DemoEntry["branch"] | "alle">("alle");
  const [built, setBuilt] = useState<{ slug: string; url: string }[]>([]);
  const shown = filter === "alle" ? DEMO_CATALOG : DEMO_CATALOG.filter((d) => d.branch === filter);

  useEffect(() => {
    fetch("/api/studio/list")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) setBuilt(d.demos);
      })
      .catch(() => {});
  }, []);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {built.length > 0 && (
        <div style={{ display: "grid", gap: 12 }}>
          <div className="cc-kicker">Byggede demoer</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
            {built.map((b) => (
              <a
                key={b.slug}
                href={"/demo/" + b.slug}
                target="_blank"
                rel="noopener noreferrer"
                className="cc-card cc-focus"
                style={{ overflow: "hidden", textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", transition: "transform 140ms ease, border-color 140ms ease" }}
              >
                <div style={{ aspectRatio: "16 / 10", position: "relative", background: "var(--bg-3)", overflow: "hidden" }}>
                  <iframe
                    src={"/demo/" + b.slug}
                    title={b.slug}
                    loading="lazy"
                    tabIndex={-1}
                    style={{ position: "absolute", top: 0, left: 0, width: "200%", height: "200%", transform: "scale(0.5)", transformOrigin: "top left", border: "none", pointerEvents: "none" }}
                  />
                </div>
                <div className="cc-card-pad" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{b.slug}</div>
                    <div className="cc-dim" style={{ fontSize: 11.5 }}>/demo/{b.slug}</div>
                  </div>
                  <Icon name="ArrowRight" style={{ width: 15, height: 15, color: "var(--text-dim)", marginLeft: "auto" }} />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
      <div className="cc-tabs" role="tablist" aria-label="Filtrér efter branche" style={{ flexWrap: "wrap" }}>
        {BRANCHES.map((b) => (
          <button
            key={b.id}
            role="tab"
            aria-selected={filter === b.id}
            data-active={filter === b.id}
            className="cc-tab"
            onClick={() => setFilter(b.id)}
          >
            {b.label}
          </button>
        ))}
      </div>

      {shown.length === 0 && (
        <div className="cc-card cc-empty">
          <Icon name="LayoutGrid" />
          <div style={{ fontWeight: 600, fontSize: 13.5, color: "var(--text-muted)" }}>Ingen demoer i denne branche endnu</div>
          <div style={{ fontSize: 12.5 }}>Branchen mangler i demo-biblioteket.</div>
          <a href="/studio/prompt-gen" className="cc-btn" style={{ marginTop: 4 }}>+ Lav demo</a>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 16 }}>
        {shown.map((d) => (
          <a
            key={d.url}
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className="cc-card cc-focus"
            style={{ overflow: "hidden", textDecoration: "none", color: "inherit", display: "flex", flexDirection: "column", transition: "transform 140ms ease, border-color 140ms ease" }}
          >
            <div style={{ aspectRatio: "16 / 10", position: "relative", background: "var(--bg-3)", overflow: "hidden" }}>
              <iframe
                src={d.url}
                title={d.label}
                loading="lazy"
                tabIndex={-1}
                style={{ position: "absolute", top: 0, left: 0, width: "200%", height: "200%", transform: "scale(0.5)", transformOrigin: "top left", border: "none", pointerEvents: "none" }}
              />
            </div>
            <div className="cc-card-pad" style={{ padding: "13px 16px", display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</div>
                <div className="cc-dim" style={{ fontSize: 11.5 }}>{prettyHost(d.url)}</div>
              </div>
              <Icon name="ArrowRight" style={{ width: 15, height: 15, color: "var(--text-dim)", marginLeft: "auto" }} />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}

function prettyHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

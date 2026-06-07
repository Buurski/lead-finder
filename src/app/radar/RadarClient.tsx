"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/shell/Icon";

interface RadarItem {
  title: string;
  source: string;
  url: string;
  why: string;
  tags: string[];
  score: number;
  date?: string;
}

export default function RadarClient() {
  const [items, setItems] = useState<RadarItem[]>([]);
  const [at, setAt] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [source, setSource] = useState<string>("alle");

  useEffect(() => {
    fetch("/api/radar")
      .then((r) => r.json())
      .then((d) => {
        setItems(Array.isArray(d.items) ? d.items : []);
        setAt(d.at ?? null);
        setState("ok");
      })
      .catch(() => setState("error"));
  }, []);

  const sources = useMemo(() => ["alle", ...Array.from(new Set(items.map((i) => i.source)))], [items]);
  const visible = source === "alle" ? items : items.filter((i) => i.source === source);
  const ageMin = at ? Math.round((Date.now() - Date.parse(at)) / 60000) : null;

  if (state === "loading") {
    return <div style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 72 }} />)}</div>;
  }
  if (items.length === 0) {
    return (
      <div className="cc-card">
        <div className="cc-empty">
          <Icon name="Radar" />
          <div>Ingen radar-kørsel endnu.</div>
          <div className="cc-dim" style={{ fontSize: 12, maxWidth: "48ch" }}>
            Den daglige Cowork-radar-task fylder de mest relevante nye AI-ting ind her (skills, tools, teknikker), scoret efter hvad vi kan bruge i OS&apos;et.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {sources.map((s) => (
          <button
            key={s}
            onClick={() => setSource(s)}
            style={{
              height: 30, padding: "0 12px", fontSize: 12.5, fontWeight: 600, borderRadius: 999, cursor: "pointer",
              border: "1px solid var(--border)",
              background: source === s ? "var(--accent)" : "transparent",
              color: source === s ? "white" : "var(--text-dim)",
            }}
          >{s}</button>
        ))}
        {ageMin != null && ageMin >= 0 && <span className="cc-dim" style={{ fontSize: 11.5, marginLeft: "auto" }}>opdateret {ageMin < 60 ? `${ageMin}m` : `${Math.round(ageMin / 60)}t`} siden</span>}
      </div>

      <div className="cc-card" style={{ overflow: "hidden" }}>
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {visible.map((it, i) => (
            <li key={it.url + i} style={{ display: "flex", alignItems: "flex-start", gap: 13, padding: "14px 18px", borderTop: i ? "1px solid var(--border)" : "none" }}>
              <span style={{ width: 34, flexShrink: 0, fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: it.score >= 80 ? "var(--accent-ink)" : it.score >= 60 ? "var(--amber)" : "var(--text-dim)" }}>{it.score}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <a href={it.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600, fontSize: 13, color: "var(--text-dim)", textDecoration: "none" }}>{it.title} <span style={{ color: "var(--green)", fontSize: 11 }}>↗</span></a>
                {it.why && <div style={{ fontSize: 13.5, marginTop: 2, lineHeight: 1.55, color: "var(--text)", fontWeight: 500 }}>{it.why}</div>}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
                  <span className="cc-kicker" style={{ fontSize: 10.5 }}>{it.source}</span>
                  {it.tags.map((t) => (
                    <span key={t} style={{ fontSize: 10.5, color: "var(--text-dim)", background: "var(--bg-3)", border: "1px solid var(--border)", padding: "1px 7px", borderRadius: 6 }}>{t}</span>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

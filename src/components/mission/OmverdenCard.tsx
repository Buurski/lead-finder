"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

// "Omverden" — kurateret daglig viden udefra (TechTwitter, AI-nyt, idéer der
// passer Kinly/lead-system). Data kommer fra den LOKALE omverden-daily task
// (last30days-skillet → vaultens data/omverden.json) via /api/omverden.
// Dato-stemplet er bevidst prominent: stale fund skal SES, ikke skjules —
// forsiden må aldrig ligne "frisk viden" når tasken ikke har kørt.

interface OmverdenItem {
  title: string;
  summary: string;
  url?: string;
  source: string;
  tag?: string;
}

interface OmverdenData {
  ok: boolean;
  at: string | null;
  staleHours: number | null;
  items: OmverdenItem[];
}

const SOURCE_LABEL: Record<string, string> = {
  x: "X", reddit: "Reddit", hn: "HN", github: "GitHub", youtube: "YouTube", web: "web",
};

export default function OmverdenCard() {
  const [data, setData] = useState<OmverdenData | null>(null);
  useEffect(() => {
    fetch("/api/omverden")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ ok: false, at: null, staleHours: null, items: [] }));
  }, []);

  // Ingen fil endnu / fetch-fejl → vis intet. Kortet skal ikke støje før
  // tasken er sat op; CronHealth er stedet der råber om manglende kørsler.
  if (!data?.ok || data.items.length === 0) return null;

  const stale = (data.staleHours ?? 0) > 36;
  const dateLabel = data.at
    ? new Date(data.at).toLocaleDateString("da-DK", { weekday: "long", day: "numeric", month: "long" })
    : "";

  return (
    <section className="cc-card" aria-label="Omverden">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--border)" }}>
        <Icon name="Globe" style={{ width: 18, height: 18, color: "var(--accent-ink)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>Omverden</h2>
        {dateLabel && (
          <span className="cc-dim" style={{ fontSize: 12.5, marginLeft: 2, color: stale ? "var(--amber)" : undefined }}>
            · {dateLabel}{stale ? " — gammel kørsel" : ""}
          </span>
        )}
      </div>
      <div className="cc-card-pad" style={{ display: "grid", gap: 12, paddingTop: 14, opacity: stale ? 0.75 : 1 }}>
        {data.items.map((it) => (
          <div key={it.title} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span className="cc-dim" style={{ fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 3, flexShrink: 0, minWidth: 44 }}>
              {SOURCE_LABEL[it.source] ?? it.source}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.4 }}>
                {it.url ? (
                  <a href={it.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                    {it.title} <span className="cc-dim" style={{ fontSize: 11 }}>↗</span>
                  </a>
                ) : it.title}
                {it.tag && (
                  <span style={{ marginLeft: 7, padding: "1px 7px", fontSize: 10.5, borderRadius: 999, background: "var(--blue-dim)", color: "var(--blue)", verticalAlign: "middle" }}>
                    {it.tag}
                  </span>
                )}
              </div>
              {it.summary && <div className="cc-muted" style={{ fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{it.summary}</div>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

"use client";

// Tragt-status for det offentlige gratis SEO-tjek (/seo-tjek). Læser
// /api/seo-tjek/stats (bag basic auth) — tallene har ellers ingen intern
// flade, så Lucas/Charlie kan ikke se om tragten overhovedet bruges.
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface FunnelStats {
  submissions: number;
  reports: number;
  day0Sent: number;
  day7Sent: number;
  unsubscribes: number;
  honeypot: number;
}
interface Submission {
  id: string;
  url: string;
  email: string;
  branch: string | null;
  createdAt: string;
  reportReady: boolean;
  day0SentAt: string | null;
  day7SentAt: string | null;
  unsubscribedAt: string | null;
}

export default function SeoTjekFunnel() {
  const [stats, setStats] = useState<FunnelStats | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/seo-tjek/stats")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        setStats(d.stats ?? null);
        setSubs(Array.isArray(d.submissions) ? d.submissions.slice(0, 5) : []);
      })
      .catch(() => setFailed(true));
  }, []);

  if (failed || (stats && stats.submissions === 0)) return null; // stille når tom/utilgængelig

  return (
    <section className="cc-card" aria-label="Gratis SEO-tjek tragt">
      <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 9, borderBottom: "1px solid var(--border)" }}>
        <Icon name="Gauge" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Gratis SEO-tjek · tragt</h2>
        <a href="/seo-tjek" target="_blank" rel="noreferrer" className="cc-link" style={{ marginLeft: "auto", fontSize: 12.5, fontWeight: 600 }}>
          Åbn siden →
        </a>
      </div>
      {!stats ? (
        <div className="cc-card-pad"><div className="cc-skel" style={{ height: 40 }} /></div>
      ) : (
        <>
          <div className="cc-card-pad" style={{ display: "flex", gap: 22, flexWrap: "wrap" }}>
            {[
              { label: "indsendt", value: stats.submissions },
              { label: "rapporter", value: stats.reports },
              { label: "dag 0-mails", value: stats.day0Sent },
              { label: "dag 7-mails", value: stats.day7Sent },
              { label: "afmeldt", value: stats.unsubscribes },
            ].map((it) => (
              <div key={it.label}>
                <div className="cc-stat-n" style={{ fontSize: 22 }}>{it.value}</div>
                <div className="cc-stat-l">{it.label}</div>
              </div>
            ))}
          </div>
          {subs.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, borderTop: "1px solid var(--border)" }}>
              {subs.map((s) => (
                <li key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 22px", borderBottom: "1px solid var(--border)", fontSize: 12.5, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.url.replace(/^https?:\/\//, "")}</span>
                  <span className="cc-dim">{s.email}</span>
                  <span className="cc-dim" style={{ marginLeft: "auto" }}>
                    {s.unsubscribedAt ? "afmeldt" : s.day7SentAt ? "dag 7 sendt" : s.day0SentAt ? "dag 0 sendt" : s.reportReady ? "rapport klar" : "afventer rapport"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

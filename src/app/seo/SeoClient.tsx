"use client";
import { useState } from "react";
import Icon from "@/components/shell/Icon";

interface ClientRow {
  id: string;
  name: string;
  branch: string;
  websiteStatus: string;
}

interface LhScores { performance: number; accessibility: number; bestPractices: number; seo: number }
interface CruxResult { available: boolean; lcpMs: number | null; inpMs: number | null; cls: number | null; overall: string | null; note: string }
interface GeoResult { llmsTxt: boolean; aiCrawlersAllowed: boolean | null; blockedBots: string[]; citabilityNote: string; note: string }
interface OnPageCheck { label: string; ok: boolean; detail: string; weight: number }
interface SeoResult {
  tier: string;
  healthScore: number | null;
  topIssues: string[];
  onPage: { checks: OnPageCheck[]; score: number } | null;
  schema: { found: boolean; types: string[]; count: number } | null;
  schemaSuggestion: string | null;
  crux: CruxResult | null;
  geo: GeoResult | null;
  index: { indexed: number | null; note: string } | null;
  aiVisibility: { mentioned: boolean | null; detail: string } | null;
  lighthouse: { available: boolean; note: string; scores: LhScores | null; cached?: boolean } | null;
  notes: string[];
}

export default function SeoClient({ clients, ok }: { clients: ClientRow[]; ok: boolean }) {
  if (!ok) {
    return (
      <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <Icon name="Activity" style={{ width: 18, height: 18, color: "var(--amber)" }} />
        <span className="cc-muted" style={{ fontSize: 13.5 }}>Kunne ikke nå Sheets — klientlisten er tom her.</span>
      </div>
    );
  }
  if (clients.length === 0) {
    return (
      <div className="cc-card">
        <div className="cc-empty"><Icon name="Search" /><div>Ingen klienter endnu.</div></div>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", gap: 14 }}>
      {clients.map((c) => (
        <SeoCard key={c.id} client={c} />
      ))}
    </div>
  );
}

function SeoCard({ client }: { client: ClientRow }) {
  const [domain, setDomain] = useState("");
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<SeoResult | null>(null);
  const [report, setReport] = useState("");
  const [err, setErr] = useState("");

  async function run() {
    if (!domain.trim()) { setErr("Angiv et domæne først."); setState("error"); return; }
    setState("running");
    setErr("");
    try {
      const res = await fetch("/api/seo/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: client.name, domain, branch: client.branch }),
      });
      const d = await res.json();
      if (!res.ok || d.ok === false) { setErr(d.error ?? "fejl"); setState("error"); return; }
      setResult(d.result);
      setReport(d.report ?? "");
      setState("done");
    } catch (e) {
      setErr(String(e));
      setState("error");
    }
  }

  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 160 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>{client.name}</div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>{client.branch} · {client.websiteStatus}</div>
        </div>
        <input
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="domæne, fx vida.dk"
          style={{ height: 34, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", padding: "0 10px", fontSize: 13, color: "var(--text)", minWidth: 160 }}
        />
        <button className="cc-btn" onClick={run} disabled={state === "running"}>
          {state === "running" ? "Tjekker…" : "Kør tjek"}
        </button>
      </div>

      {state === "error" && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 10 }}>{err}</div>}

      {state === "done" && result && (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {/* Quick overview: one health score + what to fix first */}
          {result.healthScore != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 10, background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 30, lineHeight: 1, color: scoreColor(result.healthScore) }}>{result.healthScore}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>SEO-sundhed</div>
                {result.topIssues.length > 0
                  ? <div className="cc-dim" style={{ fontSize: 12, marginTop: 2 }}>Forbedr først: {result.topIssues.slice(0, 3).join(" · ")}</div>
                  : <div className="cc-dim" style={{ fontSize: 12, marginTop: 2 }}>Ingen kritiske mangler ✓</div>}
              </div>
            </div>
          )}
          {result.topIssues.length > 0 && (
            <div style={{ display: "grid", gap: 4, padding: "10px 14px", borderRadius: 10, background: "var(--amber-dim)", border: "1px solid var(--amber)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Hvad skal forbedres</div>
              {result.topIssues.map((it, i) => (
                <div key={i} style={{ fontSize: 12.5, color: "var(--text)" }}>• {it}</div>
              ))}
            </div>
          )}
          <span className="cc-chip" style={{ width: "fit-content" }}>{result.tier === "tier_full" ? "fuld" : "basis"}-niveau</span>
          <Metric label="Schema.org" value={result.schema ? (result.schema.found ? result.schema.types.join(", ") : "ingen fundet") : "ikke tjekket"} good={!!result.schema?.found} />
          {result.lighthouse?.scores ? (
            <LighthouseRow s={result.lighthouse.scores} cached={result.lighthouse.cached} />
          ) : (
            <Metric label="Lighthouse" value={result.lighthouse?.note ?? "n/a"} />
          )}
          {result.crux && (
            result.crux.available
              ? <Metric label="Core Web Vitals (felt)" value={`${cwvLabel(result.crux.overall)} · LCP ${fmtMs(result.crux.lcpMs)} · INP ${fmtMs(result.crux.inpMs)} · CLS ${result.crux.cls != null ? result.crux.cls.toFixed(2) : "–"}`} good={result.crux.overall === "good"} />
              : <Metric label="Core Web Vitals (felt)" value={result.crux.note} />
          )}
          {result.geo && (
            <Metric
              label="GEO / AI-søgning"
              value={`${result.geo.aiCrawlersAllowed === false ? `⚠ blokerer ${result.geo.blockedBots.join(", ")}` : result.geo.aiCrawlersAllowed ? "AI-crawlere tilladt" : "ingen robots.txt"} · llms.txt ${result.geo.llmsTxt ? "✓" : "mangler"} · ${result.geo.citabilityNote}`}
              good={result.geo.aiCrawlersAllowed !== false}
            />
          )}
          {result.index && <Metric label="Google-index" value={result.index.indexed != null ? `~${result.index.indexed} sider` : result.index.note} />}
          {result.aiVisibility && <Metric label="AI-synlighed" value={result.aiVisibility.mentioned == null ? result.aiVisibility.detail : result.aiVisibility.mentioned ? "kendt ✓" : "ukendt"} good={result.aiVisibility.mentioned === true} />}
          {result.schemaSuggestion && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--accent-ink)", fontWeight: 600 }}>
                Mangler schema — kopiér færdigt LocalBusiness-snippet ↓
              </summary>
              <div style={{ position: "relative", marginTop: 8 }}>
                <button
                  onClick={() => navigator.clipboard?.writeText(result.schemaSuggestion ?? "")}
                  style={{ position: "absolute", top: 6, right: 6, fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text-dim)" }}
                >Kopiér</button>
                <pre style={{ padding: 12, background: "var(--bg-3)", borderRadius: 8, fontSize: 11, lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap" }}>{result.schemaSuggestion}</pre>
              </div>
              <div className="cc-dim" style={{ fontSize: 11.5, marginTop: 4 }}>Indsæt i {"<head>"} på kundens side. Udfyld telefon/billede.</div>
            </details>
          )}
          {result.onPage && (
            <details style={{ marginTop: 4 }}>
              <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--accent-ink)", fontWeight: 600 }}>On-page tjekliste ({result.onPage.score}/100) ↓</summary>
              <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                {result.onPage.checks.map((c, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, fontSize: 12.5, alignItems: "center" }}>
                    <span style={{ color: c.ok ? "var(--green)" : "var(--amber)", width: 14, flexShrink: 0 }}>{c.ok ? "✓" : "✗"}</span>
                    <span style={{ flex: 1 }}>{c.label}</span>
                    <span className="cc-dim">{c.detail}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          {report && (
            <details style={{ marginTop: 6 }}>
              <summary style={{ cursor: "pointer", fontSize: 12.5, color: "var(--accent-ink)" }}>Vis månedsrapport (markdown)</summary>
              <pre style={{ marginTop: 8, padding: 12, background: "var(--bg-3)", borderRadius: 8, fontSize: 11.5, lineHeight: 1.5, overflowX: "auto", whiteSpace: "pre-wrap" }}>{report}</pre>
            </details>
          )}
        </div>
      )}
    </section>
  );
}

function scoreColor(n: number): string {
  if (n >= 90) return "var(--accent-ink)";
  if (n >= 50) return "var(--amber)";
  return "var(--red)";
}

function cwvLabel(overall: string | null): string {
  return overall === "good" ? "god ✓" : overall === "needs-improvement" ? "kan forbedres" : overall === "poor" ? "dårlig" : "–";
}
function fmtMs(ms: number | null): string {
  if (ms == null) return "–";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

function LighthouseRow({ s, cached }: { s: LhScores; cached?: boolean }) {
  const items: [string, number][] = [["Perf", s.performance], ["A11y", s.accessibility], ["Best", s.bestPractices], ["SEO", s.seo]];
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 13, alignItems: "center" }}>
      <span className="cc-dim" style={{ width: 120, flexShrink: 0 }}>Lighthouse{cached ? " (cache)" : ""}</span>
      <div style={{ display: "flex", gap: 10 }}>
        {items.map(([k, n]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", border: `2px solid ${scoreColor(n)}`, color: scoreColor(n), display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}>{n}</span>
            <span className="cc-dim" style={{ fontSize: 11 }}>{k}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 10, fontSize: 13 }}>
      <span className="cc-dim" style={{ width: 120, flexShrink: 0 }}>{label}</span>
      <span style={{ color: good ? "var(--accent-ink)" : "var(--text)", fontWeight: good ? 600 : 400, minWidth: 0 }}>{value}</span>
    </div>
  );
}

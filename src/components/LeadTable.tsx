"use client";
import { useState, useMemo, useEffect } from "react";
import { MapPin, Phone, Globe, ExternalLink, X, RefreshCw, AlertCircle, CheckCircle2, Mail } from "lucide-react";
import type { Lead, LeadStatus } from "@/lib/sheets";
import type { AnalysisResult } from "@/app/api/leads/[id]/analyze/route";
import type { EnrichedInfo } from "@/app/api/leads/[id]/enrich/route";
import EmailPanel from "./EmailPanel";

const STATUS: Record<LeadStatus, { color: string; bg: string; label: string }> = {
  new:        { color: "#4338ca", bg: "#e0e7ff", label: "Ny" },
  called:     { color: "#b45309", bg: "#fef3c7", label: "Ringet" },
  interested: { color: "#15803d", bg: "#dcfce7", label: "Interesseret" },
  client:     { color: "#14532d", bg: "#bbf7d0", label: "Klient ✓" },
  skip:       { color: "#64748b", bg: "#f1f5f9", label: "Skip" },
};

const NEXT: Partial<Record<LeadStatus, LeadStatus>> = {
  new: "called",
  called: "interested",
  interested: "client",
};

const WEB_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  none:     { label: "Ingen",    color: "#64748b", bg: "#f1f5f9" },
  dead:     { label: "Død",      color: "#dc2626", bg: "#fee2e2" },
  old:      { label: "Forældet", color: "#b45309", bg: "#fef3c7" },
  mediocre: { label: "Middel",   color: "#7c3aed", bg: "#ede9fe" },
  modern:   { label: "Moderne",  color: "#15803d", bg: "#dcfce7" },
  ok:       { label: "Har",      color: "#15803d", bg: "#dcfce7" }, // fallback before verification
};

function webBadge(lead: { websiteStatus: string; websiteQualityTier: string }) {
  // Prefer verified quality tier over raw scrape status
  if (lead.websiteQualityTier) return WEB_STATUS[lead.websiteQualityTier] ?? WEB_STATUS.ok;
  return WEB_STATUS[lead.websiteStatus] ?? WEB_STATUS.none;
}

function tier(score: number): { label: string; color: string; bg: string } {
  if (score >= 70) return { label: "A", color: "#14532d", bg: "#bbf7d0" };
  if (score >= 40) return { label: "B", color: "#b45309", bg: "#fef3c7" };
  return                  { label: "C", color: "#64748b", bg: "#f1f5f9" };
}

function ScoreCell({ rank, score }: { rank: number; score: number }) {
  const t = tier(score);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 11, color: "var(--text-dim)", minWidth: 22, fontFamily: "var(--font-jakarta)" }}>#{rank}</span>
      <span style={{
        background: t.bg, color: t.color, borderRadius: 4,
        padding: "1px 6px", fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
      }}>{t.label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-muted)", fontFamily: "var(--font-jakarta)" }}>
        {score}
      </span>
    </div>
  );
}

type FilterStatus = LeadStatus | "all";
type ScoreTier = "all" | "A" | "B" | "C";

export default function LeadTable({ leads: initial }: { leads: Lead[] }) {
  const [leads, setLeads] = useState(initial);
  const [selected, setSelected] = useState<Lead | null>(null);
  const [notes, setNotes] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [enriched, setEnriched] = useState<EnrichedInfo | null>(null);
  const [enriching, setEnriching] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterTier, setFilterTier] = useState<ScoreTier>("all");
  const [filterBranch, setFilterBranch] = useState("all");
  const [filterCity, setFilterCity] = useState("all");
  const [filterWebsite, setFilterWebsite] = useState<"all" | "has" | "none">("all");
  const [filterWebRating, setFilterWebRating] = useState<"all" | "none" | "dead" | "old" | "mediocre" | "modern">("all");

  const branches = useMemo(() => {
    const set = new Set(leads.map(l => l.branch).filter(Boolean));
    return Array.from(set).sort();
  }, [leads]);

  const cities = useMemo(() => {
    const set = new Set(leads.map(l => l.city).filter(Boolean));
    return Array.from(set).sort();
  }, [leads]);

  const sorted = useMemo(() => [...leads].sort((a, b) => b.score - a.score), [leads]);

  const filtered = useMemo(() => {
    return sorted.filter(l => {
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (filterTier !== "all" && tier(l.score).label !== filterTier) return false;
      if (filterBranch !== "all" && l.branch !== filterBranch) return false;
      if (filterCity !== "all" && l.city !== filterCity) return false;
      if (filterWebsite === "has" && l.websiteStatus === "none") return false;
      if (filterWebsite === "none" && l.websiteStatus !== "none") return false;
      if (filterWebRating !== "all") {
        // Use verified tier if available, otherwise fall back to scraped websiteStatus
        const tier: string =
          l.websiteQualityTier ||
          (l.websiteStatus === "none" ? "none" :
           l.websiteStatus === "dead" ? "dead" :
           l.websiteStatus === "old"  ? "old"  : "");
        if (tier !== filterWebRating) return false;
      }
      return true;
    });
  }, [sorted, filterStatus, filterTier, filterBranch, filterCity, filterWebsite, filterWebRating]);

  async function updateStatus(lead: Lead, status: LeadStatus) {
    setUpdating(lead.id);
    try {
      await fetch(`/api/leads/${lead.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes }),
      });
      const updated = { ...lead, status, notes };
      setLeads((prev) => prev.map((l) => l.id === lead.id ? updated : l));
      setSelected(updated);
    } finally {
      setUpdating(null);
    }
  }

  async function analyze(lead: Lead) {
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/analyze`);
      const data = await res.json();
      setAnalysis(data);
    } finally {
      setAnalyzing(false);
    }
  }

  async function enrich(lead: Lead) {
    setEnriching(true);
    setEnriched(null);
    try {
      const res = await fetch(`/api/leads/${lead.id}/enrich`, { method: "POST" });
      const data = await res.json();
      setEnriched(data);
    } finally {
      setEnriching(false);
    }
  }

  function selectLead(lead: Lead) {
    setSelected(lead);
    setNotes(lead.notes);
    setAnalysis(null);
    // Load stored enriched info if available
    if (lead.enrichedInfo) {
      try { setEnriched(JSON.parse(lead.enrichedInfo)); } catch { setEnriched(null); }
    } else {
      setEnriched(null);
    }
  }

  // Auto-enrich when a lead is marked Interesseret for the first time
  useEffect(() => {
    if (selected?.status === "interested" && !selected.enrichedInfo && !enriching && !enriched) {
      enrich(selected);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, selected?.status]);

  const activeFilters = [filterStatus !== "all", filterTier !== "all", filterBranch !== "all", filterCity !== "all", filterWebsite !== "all", filterWebRating !== "all"].filter(Boolean).length;

  const selectStyle = {
    background: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 12,
    color: "var(--text)",
    cursor: "pointer",
    outline: "none",
    fontFamily: "var(--font-jakarta), sans-serif",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Filter bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        padding: "10px 14px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", letterSpacing: "0.06em", textTransform: "uppercase", marginRight: 4 }}>
          Filter
        </span>

        {/* Status */}
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as FilterStatus)} style={selectStyle}>
          <option value="all">Alle statusser</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>

        {/* Tier */}
        <select value={filterTier} onChange={e => setFilterTier(e.target.value as ScoreTier)} style={selectStyle}>
          <option value="all">Alle prioriteter</option>
          <option value="A">A — Høj (70+)</option>
          <option value="B">B — Medium (40–69)</option>
          <option value="C">C — Lav (0–39)</option>
        </select>

        {/* Branch */}
        <select value={filterBranch} onChange={e => setFilterBranch(e.target.value)} style={selectStyle}>
          <option value="all">Alle brancher</option>
          {branches.map(b => <option key={b} value={b}>{b}</option>)}
        </select>

        {/* City */}
        <select value={filterCity} onChange={e => setFilterCity(e.target.value)} style={selectStyle}>
          <option value="all">Alle byer</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        {/* Website presence */}
        <select value={filterWebsite} onChange={e => setFilterWebsite(e.target.value as "all" | "has" | "none")} style={selectStyle}>
          <option value="all">Alle hjemmesider</option>
          <option value="has">Har hjemmeside</option>
          <option value="none">Ingen hjemmeside</option>
        </select>

        {/* Website rating */}
        <select value={filterWebRating} onChange={e => setFilterWebRating(e.target.value as typeof filterWebRating)} style={selectStyle}>
          <option value="all">Alle ratings</option>
          <option value="none">Ingen hjemmeside</option>
          <option value="dead">Død</option>
          <option value="old">Forældet</option>
          <option value="mediocre">Middel</option>
          <option value="modern">Moderne</option>
        </select>

        {activeFilters > 0 && (
          <button
            onClick={() => { setFilterStatus("all"); setFilterTier("all"); setFilterBranch("all"); setFilterCity("all"); setFilterWebsite("all"); setFilterWebRating("all"); }}
            style={{ fontSize: 11, color: "var(--text-dim)", cursor: "pointer", marginLeft: 4, background: "none", border: "none", padding: 0 }}
          >
            Ryd ({activeFilters})
          </button>
        )}

        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-dim)" }}>
          {filtered.length} / {leads.length}
        </span>
      </div>

      <div className="flex gap-5" style={{ minHeight: "calc(100vh - 220px)" }}>

        {/* Table */}
        <div className="flex-1 min-w-0" style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
          <table className="w-full" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)" }}>
                {["Rang", "Virksomhed", "Branch", "By", "Hjemmeside", "Status"].map((h) => (
                  <th key={h} style={{
                    padding: "10px 16px",
                    textAlign: "left",
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--text-dim)",
                    fontFamily: "var(--font-jakarta), sans-serif",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((lead, idx) => {
                const s = STATUS[lead.status];
                const ws = webBadge(lead);
                const active = selected?.id === lead.id;
                const rank = sorted.findIndex(l => l.id === lead.id) + 1;
                return (
                  <tr key={lead.id}
                    onClick={() => selectLead(lead)}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background: active ? "var(--green-dim)" : "transparent",
                      cursor: "pointer",
                      transition: "background 0.15s ease",
                      boxShadow: active ? "inset 3px 0 0 var(--green)" : "none",
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "var(--bg-3)"; }}
                    onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                  >
                    <td style={{ padding: "11px 16px" }}><ScoreCell rank={rank} score={lead.score} /></td>
                    <td style={{ padding: "11px 16px", fontWeight: 500, color: "var(--text)", fontSize: 14 }}>{lead.name}</td>
                    <td style={{ padding: "11px 16px", color: "var(--text-muted)", fontSize: 13 }}>{lead.branch}</td>
                    <td style={{ padding: "11px 16px", color: "var(--text-muted)", fontSize: 13 }}>{lead.city}</td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{
                        background: ws.bg, color: ws.color,
                        borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 600,
                      }}>{ws.label}</span>
                    </td>
                    <td style={{ padding: "11px 16px" }}>
                      <span style={{
                        background: s.bg, color: s.color,
                        borderRadius: 6, padding: "2px 8px", fontSize: 12, fontWeight: 600,
                      }}>{s.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div style={{ padding: "80px 0", textAlign: "center", color: "var(--text-dim)" }}>
              {leads.length === 0
                ? <>Ingen leads endnu — klik &quot;+ Hent leads&quot; for at starte</>
                : "Ingen leads matcher filtrene"
              }
            </div>
          )}
        </div>

        {/* Side panel */}
        {selected && (
          <div style={{
            width: 300,
            flexShrink: 0,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderTop: "2px solid var(--green)",
            borderRadius: 12,
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 16,
            alignSelf: "flex-start",
            position: "sticky",
            top: 24,
            boxShadow: "0 4px 20px oklch(0% 0 0 / 0.07), 0 1px 4px oklch(0% 0 0 / 0.04)",
          }}>
            <div className="flex items-start justify-between">
              <div>
                <h2 style={{ fontFamily: "var(--font-fraunces), serif", fontWeight: 700, fontSize: 16, color: "var(--text)", lineHeight: 1.3 }}>
                  {selected.name}
                </h2>
                <p style={{ color: "var(--text-muted)", fontSize: 13, marginTop: 2 }}>
                  {selected.branch} · {selected.city}
                </p>
              </div>
              <button onClick={() => setSelected(null)} style={{ color: "var(--text-dim)", cursor: "pointer", padding: 2 }}>
                <X size={16} />
              </button>
            </div>

            {/* Tier + score */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {(() => { const t = tier(selected.score); return (
                <span style={{ background: t.bg, color: t.color, borderRadius: 5, padding: "3px 8px", fontSize: 12, fontWeight: 700 }}>
                  Prioritet {t.label}
                </span>
              ); })()}
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Score {selected.score}/100</span>
            </div>

            <div style={{ height: 1, background: "var(--border)" }} />

            {/* Contact */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selected.phone && (
                <a href={`tel:${selected.phone}`} className="flex items-center gap-2"
                  style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                >
                  <Phone size={13} style={{ color: "var(--green)" }} />
                  {selected.phone}
                </a>
              )}
              {selected.email && (
                <a href={`mailto:${selected.email}`} className="flex items-center gap-2"
                  style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                >
                  <Mail size={13} style={{ color: "var(--amber)" }} />
                  {selected.email}
                </a>
              )}
              {!selected.email && enriched?.email && (
                <a href={`mailto:${enriched.email}`} className="flex items-center gap-2"
                  style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                >
                  <Mail size={13} style={{ color: "var(--amber)" }} />
                  {enriched.email}
                </a>
              )}
              {selected.website ? (
                <a href={selected.website.startsWith("http") ? selected.website : `https://${selected.website}`}
                  target="_blank" rel="noreferrer" className="flex items-center gap-2"
                  style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text)"}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
                >
                  <Globe size={13} style={{ color: "var(--blue)" }} />
                  {selected.website.replace(/^https?:\/\//, "").substring(0, 28)}
                  <ExternalLink size={11} />
                </a>
              ) : (
                <span className="flex items-center gap-2" style={{ color: "var(--text-dim)", fontSize: 13 }}>
                  <Globe size={13} />
                  Ingen hjemmeside
                </span>
              )}
              <a
                href={`https://maps.google.com/?q=${encodeURIComponent(selected.name + " " + selected.city)}`}
                target="_blank" rel="noreferrer" className="flex items-center gap-2"
                style={{ color: "var(--text-muted)", fontSize: 13, textDecoration: "none" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "var(--text)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"}
              >
                <MapPin size={13} style={{ color: "var(--amber)" }} />
                Google Maps <ExternalLink size={11} />
              </a>
            </div>

            {/* Enrichment — shown for Interesseret leads */}
            {(selected.status === "interested" || selected.status === "client" || enriched || enriching) && (
              <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderTop: "2px solid var(--amber)", borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--amber)" }}>
                    Baggrundsinformation
                  </span>
                  <button
                    onClick={() => enrich(selected)}
                    disabled={enriching}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      fontSize: 11, color: "var(--text-dim)", cursor: enriching ? "default" : "pointer",
                      background: "none", border: "none", padding: 0, opacity: enriching ? 0.5 : 1,
                    }}
                  >
                    <RefreshCw size={11} style={{ animation: enriching ? "spin 1s linear infinite" : "none" }} />
                    {enriching ? "Henter..." : "Genindlæs"}
                  </button>
                </div>

                {enriching && (
                  <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>
                    Søger hjemmeside og Facebook...
                  </div>
                )}

                {enriched && !enriching && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

                    {/* Website info */}
                    {enriched.website && (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4, display: "flex", alignItems: "center", gap: 5 }}>
                          <Globe size={11} style={{ color: "var(--blue)" }} /> Hjemmeside
                        </div>
                        {enriched.website.description && (
                          <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, margin: "0 0 6px" }}>
                            {enriched.website.description}
                          </p>
                        )}
                        {enriched.website.headings.length > 0 && (
                          <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.6 }}>
                            {enriched.website.headings.slice(0, 3).join(" · ")}
                          </div>
                        )}
                        {enriched.website.services.length > 0 && (
                          <div style={{ marginTop: 4, display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {enriched.website.services.map(s => (
                              <span key={s} style={{ fontSize: 10, background: "var(--blue-dim)", color: "var(--blue)", borderRadius: 4, padding: "1px 6px" }}>{s}</span>
                            ))}
                          </div>
                        )}
                        {enriched.website.phone && enriched.website.phone !== selected.phone && (
                          <a href={`tel:${enriched.website.phone}`} style={{ fontSize: 11, color: "var(--green)", marginTop: 4, display: "block", textDecoration: "none" }}>
                            Fandt tlf: {enriched.website.phone}
                          </a>
                        )}
                      </div>
                    )}

                    {/* Facebook info */}
                    {enriched.facebook ? (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                          Facebook
                        </div>
                        <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, margin: "0 0 4px" }}>
                          {enriched.facebook.description.slice(0, 200)}
                        </p>
                        <a href={enriched.facebook.url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 11, color: "#1877f2", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                          Åbn Facebook-side <ExternalLink size={10} />
                        </a>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>
                          Facebook
                        </div>
                        <a href={enriched.facebookSearchUrl} target="_blank" rel="noreferrer"
                          style={{ fontSize: 12, color: "#1877f2", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                          Søg på Facebook <ExternalLink size={10} />
                        </a>
                      </div>
                    )}

                    {!enriched.website && !enriched.facebook && (
                      <p style={{ fontSize: 12, color: "var(--text-dim)", margin: 0 }}>
                        Ingen data fundet automatisk. Prøv søgelinket ovenfor.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Analyze section */}
            <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-dim)" }}>
                  Verificering
                </span>
                <button
                  onClick={() => analyze(selected)}
                  disabled={analyzing}
                  style={{
                    display: "flex", alignItems: "center", gap: 4,
                    fontSize: 11, color: "var(--blue)", cursor: analyzing ? "default" : "pointer",
                    background: "none", border: "none", padding: 0, opacity: analyzing ? 0.6 : 1,
                  }}
                >
                  <RefreshCw size={11} style={{ animation: analyzing ? "spin 1s linear infinite" : "none" }} />
                  {analyzing ? "Tjekker..." : "Kør tjek"}
                </button>
              </div>

              {analysis && (
                <div style={{ borderTop: "1px solid var(--border)", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 12 }}>

                  {/* Website analysis */}
                  {analysis.website ? (
                    <div>
                      {/* Quality tier badge */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        {analysis.website.alive
                          ? <CheckCircle2 size={12} style={{ color: "#16a34a" }} />
                          : <AlertCircle size={12} style={{ color: "#dc2626" }} />
                        }
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>Hjemmesidevurdering</span>
                        <span style={{
                          marginLeft: "auto",
                          fontSize: 10, fontWeight: 700, letterSpacing: "0.05em",
                          padding: "1px 6px", borderRadius: 4,
                          background: analysis.website.qualityTier === "modern" ? "#dcfce7"
                            : analysis.website.qualityTier === "mediocre" ? "#fef3c7"
                            : "#fee2e2",
                          color: analysis.website.qualityTier === "modern" ? "#14532d"
                            : analysis.website.qualityTier === "mediocre" ? "#b45309"
                            : "#991b1b",
                        }}>
                          {analysis.website.qualityTier === "modern" ? "MODERNE"
                            : analysis.website.qualityTier === "mediocre" ? "MIDDEL"
                            : analysis.website.qualityTier === "dead" ? "DØD"
                            : "FORÆLDET"}
                        </span>
                      </div>

                      {/* Summary */}
                      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55, margin: "0 0 8px" }}>
                        {analysis.website.summary}
                      </p>

                      {/* Detail bullets */}
                      {analysis.website.details.length > 0 && (
                        <ul style={{ margin: 0, padding: "0 0 0 14px", display: "flex", flexDirection: "column", gap: 3 }}>
                          {analysis.website.details.map((d, i) => (
                            <li key={i} style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.4 }}>{d}</li>
                          ))}
                        </ul>
                      )}

                      {/* Opportunity callout */}
                      <div style={{
                        marginTop: 8, padding: "7px 10px",
                        background: "var(--bg)", border: "1px solid var(--border)",
                        borderRadius: 6, fontSize: 11, color: "var(--text-muted)", lineHeight: 1.5,
                        fontStyle: "italic",
                      }}>
                        {analysis.website.opportunity}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text)" }}>Hjemmeside</span>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--text-muted)", margin: 0 }}>
                        Ingen hjemmeside registreret — fremragende lead.
                      </p>
                    </div>
                  )}

                  {/* Facebook */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>Facebook</div>
                    {analysis.facebook.directUrl ? (
                      <a href={analysis.facebook.directUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: "var(--blue)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                        Fundet via hjemmeside <ExternalLink size={10} />
                      </a>
                    ) : (
                      <a href={analysis.facebook.searchUrl} target="_blank" rel="noreferrer"
                        style={{ fontSize: 12, color: "var(--blue)", textDecoration: "none", display: "flex", alignItems: "center", gap: 4 }}>
                        Søg på Facebook <ExternalLink size={10} />
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>

            <EmailPanel
              lead={selected}
              onUpdate={(updated) => {
                setSelected((prev) => prev ? { ...prev, ...updated } : prev);
                setLeads((prev) =>
                  prev.map((l) => (l.id === selected.id ? { ...l, ...updated } : l))
                );
              }}
            />

            {/* Notes */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-dim)", display: "block", marginBottom: 6 }}>
                Noter
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Tilføj noter..."
                style={{
                  width: "100%",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 13,
                  color: "var(--text)",
                  resize: "none",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {NEXT[selected.status] && (
                <button
                  onClick={() => updateStatus(selected, NEXT[selected.status]!)}
                  disabled={updating === selected.id}
                  style={{
                    background: "var(--green)", color: "#fff", border: "none",
                    borderRadius: 8, padding: "9px 0", fontSize: 13, fontWeight: 600,
                    cursor: "pointer", transition: "opacity 0.15s",
                    opacity: updating === selected.id ? 0.6 : 1,
                  }}
                >
                  {updating === selected.id ? "Opdaterer..." : `→ Marker som ${STATUS[NEXT[selected.status]!].label}`}
                </button>
              )}
              {selected.status !== "skip" && selected.status !== "client" && (
                <button
                  onClick={() => updateStatus(selected, "skip")}
                  disabled={updating === selected.id}
                  style={{
                    background: "transparent", color: "var(--text-dim)",
                    border: "1px solid var(--border)", borderRadius: 8,
                    padding: "7px 0", fontSize: 12, cursor: "pointer",
                  }}
                >
                  Spring over
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

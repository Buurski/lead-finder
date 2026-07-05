"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface Item {
  name: string;
  branch: string;
  city: string;
  fitScore: number;
  gap: string;
  website: string;
  rating: number;
  reviews: number;
  channel?: "email" | "messenger" | "sms" | "none";
  hasEmail?: boolean;
  hasMessenger?: boolean;
  hasPhone?: boolean;
}

type ChannelFilter = "email" | "messenger" | "phone";

const CHANNEL_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  email: { label: "✉ Email", bg: "var(--accent-soft)", fg: "var(--accent-ink)" },
  messenger: { label: "💬 Messenger", bg: "#e0e7ff", fg: "#4338ca" },
  sms: { label: "📱 SMS", bg: "#fef3c7", fg: "#b45309" },
  none: { label: "— ingen kanal", bg: "var(--bg-3)", fg: "var(--text-dim)" },
};
interface LastRun {
  at: string;
  source: string;
  ingested: number;
  skipped: number;
}

// Valid presets ONLY (mirror REGION_PRESETS / BRANCH_PRESETS in apify.ts). Anything
// else falls back to the full DK sweep server-side and times out. Beauty first —
// Lucas weights skønhed up.
const REGIONS = ["aarhus", "odense", "esbjerg", "aalborg", "midt"];
const BRANCHES = ["beauty", "food", "craft", "professional"];

export default function LeadgenPanel() {
  const [leads, setLeads] = useState<Item[]>([]);
  const [totalContactable, setTotalContactable] = useState(0);
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [ageMin, setAgeMin] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  // DEFAULT = auto (whole DK, all branches). Specific narrows via the dropdowns.
  const [mode, setMode] = useState<"auto" | "specific">("auto");
  const [region, setRegion] = useState("aarhus");
  const [branch, setBranch] = useState("beauty");
  const [scraping, setScraping] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [msg, setMsg] = useState("");
  const [budget, setBudget] = useState<{ used: number; cap: number; remaining: number } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftMsg, setDraftMsg] = useState("");
  // Channel filters (multi-select) + per-row selection for the batch-draft flow.
  const [filters, setFilters] = useState<Set<ChannelFilter>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggleFilter(f: ChannelFilter) {
    setFilters((prev) => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }
  function toggleSelected(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  // A lead passes the filter if it has AT LEAST ONE of the checked channels (OR).
  // No filter checked → show everything.
  function matchesFilters(it: Item): boolean {
    if (filters.size === 0) return true;
    if (filters.has("email") && it.hasEmail) return true;
    if (filters.has("messenger") && it.hasMessenger) return true;
    if (filters.has("phone") && it.hasPhone) return true;
    return false;
  }

  // Bridge the Sheets pool → /approve: run the engine on the top-N contactable leads
  // and append the drafts to the approval queue. Never sends mail.
  async function makeDrafts() {
    setDrafting(true);
    setDraftMsg("");
    try {
      const r = await fetch("/api/leads/draft-batch?limit=12", { method: "POST" });
      const d = await r.json().catch(() => ({}));
      setDraftMsg(r.ok ? `${d.drafted ?? 0} udkast lagt i godkendelse.` : (d.error ?? "Kunne ikke lave udkast."));
    } catch (e) {
      setDraftMsg(String(e));
    } finally {
      setDrafting(false);
    }
  }

  // Batch-draft EXACTLY the selected rows (Lucas's flow: filter på email → vælg →
  // klik). Only email-channel leads become drafts (the engine drafts emails); rows
  // without an email are reported back as skipped.
  async function makeDraftsSelected() {
    const names = [...selected];
    if (names.length === 0) return;
    setDrafting(true);
    setDraftMsg("");
    try {
      const r = await fetch("/api/leads/draft-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ names }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        const skipN = Array.isArray(d.skipped) ? d.skipped.length : 0;
        setDraftMsg(`${d.drafted ?? 0} udkast lagt i godkendelse${skipN ? ` · ${skipN} sprunget over (ingen email/voice)` : ""}.`);
        setSelected(new Set());
      } else {
        setDraftMsg(d.error ?? "Kunne ikke lave udkast.");
      }
    } catch (e) {
      setDraftMsg(String(e));
    } finally {
      setDrafting(false);
    }
  }

  function load() {
    fetch("/api/leads/ingest")
      .then((r) => r.json())
      .then((d) => {
        setLeads(Array.isArray(d.leads) ? d.leads : []);
        setTotalContactable(typeof d.totalContactable === "number" ? d.totalContactable : (Array.isArray(d.leads) ? d.leads.length : 0));
        setLastRun(d.lastRun ?? null);
        setBudget(d.placesBudget ?? null);
        setAgeMin(d.lastRun?.at ? Math.round((Date.now() - Date.parse(d.lastRun.at)) / 60000) : null);
        setState("ok");
      })
      .catch(() => setState("error"));
  }
  useEffect(() => { load(); }, []);

  // Throws a budget-tagged error on a 429 so the sweep can stop cleanly.
  async function scrapeOne(r: string, b: string): Promise<number> {
    const res = await fetch(`/api/scrape?region=${r}&branch=${b}`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (res.ok && typeof d.added === "number") return d.added;
    if (res.status === 429 || d.error === "daily_places_budget_reached") {
      throw Object.assign(new Error("Places-dagsbudget nået"), { budget: true });
    }
    if (!res.ok) throw new Error(d.error ?? "scrape fejlede");
    return 0;
  }

  // Auto-sweep: loop region×branch chunks SEQUENTIALLY (each its own 300s budget),
  // never one giant timeout-prone call. New leads are composite-scored server-side;
  // already-known names/phones are skipped. Resilient: a failed chunk keeps the sweep going.
  async function runAuto() {
    let total = 0;
    let i = 0;
    const totalChunks = REGIONS.length * BRANCHES.length;
    setProgress({ done: 0, total: totalChunks });
    for (const b of BRANCHES) {
      for (const r of REGIONS) {
        i++;
        setProgress({ done: i, total: totalChunks });
        setMsg(`Skraber hele DK… ${i}/${totalChunks} (${total} nye)`);
        try {
          total += await scrapeOne(r, b);
        } catch (e) {
          // Budget exhausted mid-sweep → stop the whole sweep, not just this chunk.
          if (e && typeof e === "object" && "budget" in e) throw e;
          /* otherwise skip this chunk, keep sweeping */
        }
      }
    }
    return total;
  }

  async function scrapeNow() {
    if (budget && budget.remaining <= 0) {
      setMsg(`Places-dagsbudget nået (${budget.used}/${budget.cap}). Prøv igen i morgen.`);
      return;
    }
    setScraping(true);
    setMsg("");
    try {
      let added = 0;
      if (mode === "auto") {
        added = await runAuto();
      } else {
        setMsg(`Skraber ${branch} i ${region}…`);
        added = await scrapeOne(region, branch);
      }
      // Record "last fetch" metadata (total added across all chunks), then reload —
      // the feed reads Sheets so the new leads show up immediately.
      try { await fetch(`/api/scrape?finalize=1&added=${added}&source=places`, { method: "POST" }); } catch { /* metadata only */ }
      setMsg(`Places-scrape færdig: ${added} nye leads tilføjet.`);
      load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setScraping(false);
      setProgress({ done: 0, total: 0 });
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="cc-card cc-card-pad" style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <Icon name="Search" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>Kør Places-scrape nu</div>
            <div className="cc-dim" style={{ fontSize: 12 }}>Gratis hurtig top-up (Google Places). Den dybe rating laver den daglige Cowork-task.</div>
          </div>
        </div>

        {/* Mode toggle: hele DK (default) vs specifik */}
        <div style={{ display: "inline-flex", gap: 0, border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden", width: "fit-content" }}>
          <button onClick={() => setMode("auto")} disabled={scraping} style={seg(mode === "auto")}>Kør hele DK</button>
          <button onClick={() => setMode("specific")} disabled={scraping} style={seg(mode === "specific")}>Kør specifik</button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          {mode === "specific" && (
            <>
              <select value={region} onChange={(e) => setRegion(e.target.value)} style={sel} disabled={scraping}>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={branch} onChange={(e) => setBranch(e.target.value)} style={sel} disabled={scraping}>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </>
          )}
          <button className="cc-btn" onClick={scrapeNow} disabled={scraping || (budget != null && budget.remaining <= 0)}>
            {scraping
              ? (mode === "auto" && progress.total ? `Skraber… ${progress.done}/${progress.total}` : "Scraper…")
              : (budget != null && budget.remaining <= 0 ? "Dagsbudget nået"
              : mode === "auto" ? "Kør nu (hele DK)" : "Kør nu")}
          </button>
          <button className="cc-btn" onClick={load} disabled={scraping}><Icon name="Activity" style={{ width: 14, height: 14 }} /> Opdater feed</button>
        </div>
        <div className="cc-dim" style={{ fontSize: 11.5 }}>
          {mode === "auto"
            ? "Skraber alle brancher i alle regioner (beauty først), composite-scorer, springer kendte over. Ingen valg nødvendigt."
            : "Vælg én region + branche for en hurtig målrettet scrape."}
          {budget != null && ` · Places-budget: ${budget.remaining}/${budget.cap} søgninger tilbage i dag`}
        </div>
        {msg && <div className="cc-dim" style={{ fontSize: 12.5 }}>{msg}</div>}
      </div>

      {state === "loading" ? (
        <div style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 56 }} />)}</div>
      ) : leads.length === 0 ? (
        <div className="cc-card"><div className="cc-empty"><Icon name="Search" /><div>Ingen kontaktbare leads endnu.</div><div className="cc-dim" style={{ fontSize: 12 }}>Kør en Places-scrape ovenfor, eller lad den daglige Cowork-task fylde nye leads ind — de dukker op her så snart de er i Sheets.</div></div></div>
      ) : (
        (() => {
          const shown = leads.filter(matchesFilters);
          const selectedShown = shown.filter((it) => selected.has(it.name)).length;
          return (
        <>
          <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{totalContactable} kontaktbare leads klar{totalContactable > leads.length ? ` · viser top ${leads.length}` : ""}{filters.size > 0 ? ` · ${shown.length} efter filter` : ""}</div>
              <div className="cc-dim" style={{ fontSize: 12 }}>
                {lastRun?.at && lastRun.source !== "placeholder"
                  ? <>sidste hentning{ageMin != null && ageMin >= 0 ? ` ${ageMin} min siden` : ""}{lastRun.ingested ? ` · ${lastRun.ingested} tilføjet` : ""}{lastRun.source ? ` · kilde ${lastRun.source}` : ""}</>
                  : "rangeret efter composite-score · kontaktede leads er sorteret fra"}
                {draftMsg && <> · {draftMsg} <a className="cc-link" href="/approve" style={{ fontWeight: 600 }}>Åbn godkendelse →</a></>}
              </div>
            </div>
            <button className="cc-btn cc-btn-accent" onClick={makeDrafts} disabled={drafting || totalContactable === 0} title="Kør motoren på de bedste leads og læg personlige udkast i godkendelse — sender ingenting">
              {drafting && selected.size === 0 ? "Laver udkast…" : "Lav udkast → godkendelse (top 12)"}
            </button>
          </div>

          {/* Channel filters (multi-select) — filtrér feedet til kun de leads der kan nås på den kanal. */}
          <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <span className="cc-dim" style={{ fontSize: 12, fontWeight: 600 }}>Filtrér kanal:</span>
            {([["email", "✉ Har email"], ["messenger", "💬 Har Messenger"], ["phone", "📱 Har telefon"]] as [ChannelFilter, string][]).map(([key, label]) => (
              <label key={key} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, cursor: "pointer", userSelect: "none" }}>
                <input type="checkbox" checked={filters.has(key)} onChange={() => toggleFilter(key)} style={{ width: 15, height: 15, cursor: "pointer" }} />
                {label}
              </label>
            ))}
            {filters.size > 0 && (
              <button className="cc-link" onClick={() => setFilters(new Set())} style={{ fontSize: 12, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}>ryd filter</button>
            )}
            <span style={{ flex: 1 }} />
            {shown.length > 0 && (
              <button
                className="cc-link"
                onClick={() => {
                  const allSel = selectedShown === shown.length;
                  setSelected((prev) => {
                    const next = new Set(prev);
                    for (const it of shown) { if (allSel) next.delete(it.name); else next.add(it.name); }
                    return next;
                  });
                }}
                style={{ fontSize: 12, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >{selectedShown === shown.length ? "fravælg alle" : `vælg alle (${shown.length})`}</button>
            )}
          </div>

          <div className="cc-card" style={{ overflow: "hidden" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {shown.map((it, i) => (
                <li key={it.name + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: i ? "1px solid var(--border)" : "none", background: selected.has(it.name) ? "var(--accent-soft)" : "transparent" }}>
                  <input type="checkbox" checked={selected.has(it.name)} onChange={() => toggleSelected(it.name)} style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} title="Vælg til batch-udkast" />
                  <span style={{ width: 34, fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: it.fitScore >= 80 ? "var(--accent-ink)" : it.fitScore >= 60 ? "var(--amber)" : "var(--text-dim)" }}>{it.fitScore}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</span>
                      {it.channel && (() => { const b = CHANNEL_BADGE[it.channel] ?? CHANNEL_BADGE.none; return (
                        <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 600, padding: "1px 7px", borderRadius: 6, background: b.bg, color: b.fg }}>{b.label}</span>
                      ); })()}
                    </div>
                    <div className="cc-dim" style={{ fontSize: 12.5 }}>{[it.branch, it.city].filter(Boolean).join(" · ")}{it.reviews ? ` · ${it.reviews} anmeldelser` : ""}{it.gap ? ` · gap: ${it.gap}` : ""}</div>
                  </div>
                  {/* Always clickable: open the website if there is one, else Google the business. */}
                  <a
                    className="cc-link"
                    href={it.website
                      ? (it.website.startsWith("http") ? it.website : `https://${it.website}`)
                      : `https://www.google.com/search?q=${encodeURIComponent([it.name, it.city].filter(Boolean).join(" "))}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: 12, fontWeight: 600, flexShrink: 0 }}
                  >{it.website ? "Åbn →" : "Google →"}</a>
                </li>
              ))}
              {shown.length === 0 && (
                <li style={{ padding: "18px", textAlign: "center" }} className="cc-dim">Ingen leads matcher filteret.</li>
              )}
            </ul>
          </div>

          {/* Sticky bottom bar: batch-draft de valgte rækker. */}
          {selected.size > 0 && (
            <div style={{ position: "sticky", bottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: "12px 16px", borderRadius: 12, background: "var(--surface)", border: "1px solid var(--accent)", boxShadow: "0 6px 24px rgba(0,0,0,.12)" }}>
              <div style={{ flex: 1, minWidth: 160, fontSize: 13 }}>
                <strong>{selected.size}</strong> valgt — laver personlige email-udkast (kun leads med email).
                <button className="cc-link" onClick={() => setSelected(new Set())} style={{ marginLeft: 8, fontSize: 12, fontWeight: 600, background: "none", border: "none", cursor: "pointer", padding: 0 }}>ryd</button>
              </div>
              <button className="cc-btn cc-btn-accent" onClick={makeDraftsSelected} disabled={drafting}>
                {drafting ? "Laver udkast…" : `Lav udkast på valgte (${selected.size})`}
              </button>
            </div>
          )}
        </>
          );
        })()
      )}
    </div>
  );
}

const sel: React.CSSProperties = { height: 34, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface)", padding: "0 8px", fontSize: 13, color: "var(--text)" };
const seg = (active: boolean): React.CSSProperties => ({
  height: 32, padding: "0 14px", fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer",
  background: active ? "var(--accent)" : "transparent",
  color: active ? "white" : "var(--text-dim)",
});

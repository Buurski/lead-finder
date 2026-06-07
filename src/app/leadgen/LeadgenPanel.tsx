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
}
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

  function load() {
    fetch("/api/leads/ingest")
      .then((r) => r.json())
      .then((d) => {
        setLeads(Array.isArray(d.leads) ? d.leads : []);
        setLastRun(d.lastRun ?? null);
        setAgeMin(d.lastRun?.at ? Math.round((Date.now() - Date.parse(d.lastRun.at)) / 60000) : null);
        setState("ok");
      })
      .catch(() => setState("error"));
  }
  useEffect(() => { load(); }, []);

  async function scrapeOne(r: string, b: string): Promise<number> {
    const res = await fetch(`/api/scrape?region=${r}&branch=${b}`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    if (res.ok && typeof d.added === "number") return d.added;
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
        try { total += await scrapeOne(r, b); } catch { /* skip chunk, keep sweeping */ }
      }
    }
    return total;
  }

  async function scrapeNow() {
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
          <button className="cc-btn cc-btn-accent" onClick={scrapeNow} disabled={scraping}>
            {scraping
              ? (mode === "auto" && progress.total ? `Skraber… ${progress.done}/${progress.total}` : "Scraper…")
              : (mode === "auto" ? "Kør nu (hele DK)" : "Kør nu")}
          </button>
          <button className="cc-btn" onClick={load} disabled={scraping}><Icon name="Activity" style={{ width: 14, height: 14 }} /> Opdater feed</button>
        </div>
        <div className="cc-dim" style={{ fontSize: 11.5 }}>
          {mode === "auto"
            ? "Skraber alle brancher i alle regioner (beauty først), composite-scorer, springer kendte over. Ingen valg nødvendigt."
            : "Vælg én region + branche for en hurtig målrettet scrape."}
        </div>
        {msg && <div className="cc-dim" style={{ fontSize: 12.5 }}>{msg}</div>}
      </div>

      {state === "loading" ? (
        <div style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 56 }} />)}</div>
      ) : leads.length === 0 ? (
        <div className="cc-card"><div className="cc-empty"><Icon name="Search" /><div>Ingen kontaktbare leads endnu.</div><div className="cc-dim" style={{ fontSize: 12 }}>Kør en Places-scrape ovenfor, eller lad den daglige Cowork-task fylde nye leads ind — de dukker op her så snart de er i Sheets.</div></div></div>
      ) : (
        <>
          <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{leads.length} kontaktbare leads klar</div>
              <div className="cc-dim" style={{ fontSize: 12 }}>
                {lastRun?.at
                  ? <>sidste hentning{ageMin != null && ageMin >= 0 ? ` ${ageMin} min siden` : ""}{lastRun.ingested ? ` · ${lastRun.ingested} tilføjet` : ""}{lastRun.source ? ` · kilde ${lastRun.source}` : ""}</>
                  : "rangeret efter composite-score · kontaktede leads er sorteret fra"}
              </div>
            </div>
          </div>
          <div className="cc-card" style={{ overflow: "hidden" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {leads.map((it, i) => (
                <li key={it.name + i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <span style={{ width: 34, fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: it.fitScore >= 80 ? "var(--accent-ink)" : it.fitScore >= 60 ? "var(--amber)" : "var(--text-dim)" }}>{it.fitScore}</span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.name}</div>
                    <div className="cc-dim" style={{ fontSize: 12.5 }}>{[it.branch, it.city].filter(Boolean).join(" · ")}{it.reviews ? ` · ${it.reviews} anmeldelser` : ""}{it.gap ? ` · gap: ${it.gap}` : ""}</div>
                  </div>
                  {it.website && <a className="cc-link" href={it.website.startsWith("http") ? it.website : `https://${it.website}`} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 600 }}>Åbn →</a>}
                </li>
              ))}
            </ul>
          </div>
        </>
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

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
interface Run {
  at: string;
  source: string;
  ingested: number;
  skipped: number;
  items: Item[];
}

const REGIONS = ["aarhus", "aalborg", "odense", "koebenhavn", "trekanten", "vestjylland", "sydjylland"];
const BRANCHES = ["beauty", "food", "craft", "service"];

export default function LeadgenPanel() {
  const [run, setRun] = useState<Run | null>(null);
  const [ageMin, setAgeMin] = useState<number | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [region, setRegion] = useState("aarhus");
  const [branch, setBranch] = useState("beauty");
  const [scraping, setScraping] = useState(false);
  const [msg, setMsg] = useState("");

  function load() {
    fetch("/api/leads/ingest")
      .then((r) => r.json())
      .then((d) => {
        setRun(d.run ?? null);
        setAgeMin(d.run?.at ? Math.round((Date.now() - Date.parse(d.run.at)) / 60000) : null);
        setState("ok");
      })
      .catch(() => setState("error"));
  }
  useEffect(() => { load(); }, []);

  async function scrapeNow() {
    setScraping(true);
    setMsg("");
    try {
      const r = await fetch(`/api/scrape?region=${region}&branch=${branch}`, { method: "POST" });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? `Places-scrape færdig: ${d.added ?? d.count ?? "?"} nye leads i Sheets.` : (d.error ?? "Kunne ikke scrape."));
    } catch (e) {
      setMsg(String(e));
    } finally {
      setScraping(false);
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <select value={region} onChange={(e) => setRegion(e.target.value)} style={sel}>
            {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select value={branch} onChange={(e) => setBranch(e.target.value)} style={sel}>
            {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button className="cc-btn cc-btn-accent" onClick={scrapeNow} disabled={scraping}>
            {scraping ? "Scraper…" : "Kør nu"}
          </button>
          <button className="cc-btn" onClick={load}><Icon name="Activity" style={{ width: 14, height: 14 }} /> Opdater feed</button>
        </div>
        {msg && <div className="cc-dim" style={{ fontSize: 12.5 }}>{msg}</div>}
      </div>

      {state === "loading" ? (
        <div style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 56 }} />)}</div>
      ) : !run || run.items.length === 0 ? (
        <div className="cc-card"><div className="cc-empty"><Icon name="Search" /><div>Ingen lead-gen-kørsel endnu.</div><div className="cc-dim" style={{ fontSize: 12 }}>Den daglige Cowork-task fylder de bedste leads ind her — eller kør en Places-scrape ovenfor.</div></div></div>
      ) : (
        <>
          <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <div style={{ fontWeight: 600, fontSize: 13.5 }}>{run.ingested} nye · {run.items.length} i feed</div>
              <div className="cc-dim" style={{ fontSize: 12 }}>kilde: {run.source}{run.skipped ? ` · ${run.skipped} dubletter sprunget` : ""}{ageMin != null && ageMin >= 0 ? ` · ${ageMin} min siden` : ""}</div>
            </div>
          </div>
          <div className="cc-card" style={{ overflow: "hidden" }}>
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {run.items.map((it, i) => (
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

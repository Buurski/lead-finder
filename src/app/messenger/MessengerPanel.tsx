"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface Candidate {
  id: string;
  name: string;
  branch: string;
  city: string;
  reviews: number;
  category: string;
  qualityScore: number;
  handle: string;
  fbPageUrl: string;
  messengerUrl: string;
  draft: string;
  pattern: string;
  status: string;
}
interface Pool {
  eligible: number;
  remaining: number;
  shown: number;
  sent: number;
  skipped: number;
  depleted: boolean;
}

function CandidateCard({ c, onMark }: { c: Candidate; onMark: (id: string, action: "sent" | "skip") => void }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy() {
    try { await navigator.clipboard.writeText(c.draft); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
  }
  async function mark(action: "sent" | "skip") {
    setBusy(true);
    await onMark(c.id, action);
    setBusy(false);
  }

  return (
    <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 12, opacity: busy ? 0.6 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span title={`kvalitet ${c.qualityScore}`} style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--accent-ink)" }}>{c.qualityScore}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>{c.branch || c.category} · {c.city || "ukendt by"} · {c.reviews} anmeldelser</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="cc-btn" href={c.fbPageUrl} target="_blank" rel="noreferrer"><Icon name="Search" style={{ width: 14, height: 14 }} /> FB-side</a>
          <a className="cc-btn cc-btn-accent" href={c.messengerUrl} target="_blank" rel="noreferrer"><Icon name="MessageSquare" style={{ width: 14, height: 14 }} /> Åbn Messenger</a>
        </div>
      </div>

      <div style={{ position: "relative" }}>
        <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap", padding: "12px 14px", background: "var(--surface-2)", borderRadius: 10 }}>{c.draft}</p>
        <button className="cc-btn" onClick={copy} style={{ position: "absolute", top: 8, right: 8 }}>
          <Icon name="FileText" style={{ width: 13, height: 13 }} /> {copied ? "Kopieret ✓" : "Kopiér"}
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className="cc-btn cc-btn-accent" onClick={() => mark("sent")} disabled={busy}><Icon name="CheckCheck" style={{ width: 14, height: 14 }} /> Marker sendt</button>
        <button className="cc-btn" onClick={() => mark("skip")} disabled={busy}>Spring over</button>
        <span className="cc-dim" style={{ fontSize: 11.5, marginLeft: "auto" }}>Du sender selv på Facebook. Intet sendes herfra.</span>
      </div>
    </section>
  );
}

export default function MessengerPanel() {
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [pool, setPool] = useState<Pool | null>(null);
  const [err, setErr] = useState("");

  function load() {
    setState("loading");
    fetch("/api/messenger")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok === false) { setErr(d.error ?? "ukendt fejl"); setState("error"); return; }
        setCandidates(d.candidates ?? []);
        setPool(d.pool ?? null);
        setState("ok");
      })
      .catch((e) => { setErr(String(e)); setState("error"); });
  }
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, []);

  async function onMark(id: string, action: "sent" | "skip") {
    // Optimistic: drop the card immediately.
    setCandidates((cs) => cs.filter((c) => c.id !== id));
    try {
      const res = await fetch("/api/messenger/mark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action }),
      });
      if (!res.ok) load(); // 4xx/5xx: server didn't register it — resync
    } catch {
      load(); // resync on failure
    }
  }

  if (state === "loading") {
    return <div style={{ display: "grid", gap: 12 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 150 }} />)}</div>;
  }
  if (state === "error") {
    return (
      <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 11, alignItems: "center" }}>
        <Icon name="Activity" style={{ width: 18, height: 18, color: "var(--amber)" }} />
        <div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>Kunne ikke hente kandidater</div>
          <div className="cc-dim" style={{ fontSize: 12.5 }}>{err} — intet blev rørt.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {pool && (
        <div className="cc-card cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <Icon name="MessageSquare" style={{ width: 18, height: 18, color: "var(--accent-ink)" }} />
          <div style={{ flex: 1, minWidth: 180 }}>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{pool.remaining} tilbage i puljen · {candidates.length} vist</div>
            <div className="cc-dim" style={{ fontSize: 12 }}>{pool.sent} sendt · {pool.skipped} sprunget over · {pool.eligible} egnede i alt</div>
          </div>
          <button className="cc-btn" onClick={load}><Icon name="Activity" style={{ width: 14, height: 14 }} /> Opdater</button>
        </div>
      )}

      {pool?.depleted && (
        <div className="cc-card cc-card-pad" style={{ display: "flex", gap: 10, alignItems: "center", borderColor: "var(--amber)" }}>
          <Icon name="Activity" style={{ width: 17, height: 17, color: "var(--amber)" }} />
          <span style={{ fontSize: 13 }}>Puljen er tom — kør en rescrape på <a className="cc-link" href="/leads">Leads</a> for at finde nye FB-leads.</span>
        </div>
      )}

      {candidates.length === 0 ? (
        <div className="cc-card"><div className="cc-empty"><Icon name="MessageSquare" /><div>Ingen kandidater lige nu.</div><div className="cc-dim" style={{ fontSize: 12 }}>Marker dem du har skrevet til, eller kør en rescrape for nye FB-leads.</div></div></div>
      ) : (
        candidates.map((c) => <CandidateCard key={c.id} c={c} onMark={onMark} />)
      )}
    </div>
  );
}

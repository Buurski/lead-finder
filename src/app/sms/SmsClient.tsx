"use client";
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";

interface SmsCandidate {
  id: string;
  name: string;
  branch: string;
  city: string;
  reviews: number;
  score: number;
  phone: string;
  tel: string;
  draft: string;
}
interface Pool { eligible: number; remaining: number; shown: number; sent: number; skipped: number }

export default function SmsClient() {
  const [items, setItems] = useState<SmsCandidate[]>([]);
  const [pool, setPool] = useState<Pool | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [copied, setCopied] = useState<string | null>(null);

  // initial=true skips the synchronous setState("loading") — state already
  // starts as "loading", and sync setState in an effect body trips the
  // react-compiler lint (cascading renders).
  function load(initial = false) {
    if (!initial) setState("loading");
    fetch("/api/sms")
      .then((r) => r.json())
      .then((d) => { setItems(Array.isArray(d.candidates) ? d.candidates : []); setPool(d.pool ?? null); setState("ok"); })
      .catch(() => setState("error"));
  }
  // eslint-disable-next-line react-hooks/set-state-in-effect -- initial load; state starts as "loading", no sync setState happens (initial=true)
  useEffect(() => { load(true); }, []);

  async function mark(id: string, action: "sent" | "skipped") {
    setItems((prev) => prev.filter((c) => c.id !== id)); // optimistic
    try { await fetch("/api/sms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }); } catch { /* keep optimistic */ }
  }
  async function copy(id: string, text: string) {
    try { await navigator.clipboard?.writeText(text); setCopied(id); setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500); } catch { /* ignore */ }
  }

  if (state === "loading") return <div style={{ display: "grid", gap: 10 }}>{[0, 1, 2].map((i) => <div key={i} className="cc-skel" style={{ height: 120 }} />)}</div>;
  if (state === "error") return <div className="cc-card cc-card-pad"><span className="cc-muted" style={{ fontSize: 13.5 }}>Kunne ikke hente leads.</span></div>;
  if (items.length === 0) return (
    <div className="cc-card"><div className="cc-empty"><Icon name="Smartphone" /><div>Ingen mobil-leads i kø.</div><div className="cc-dim" style={{ fontSize: 12 }}>Leads med kun et mobilnummer (ingen email/Facebook) dukker op her, de bedste først.</div></div></div>
  );

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {pool && (
        <div className="cc-card cc-card-pad" style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          {pool.remaining} tilbage i puljen · {pool.shown} vist · {pool.sent} sendt · {pool.skipped} sprunget over
        </div>
      )}
      {items.map((c) => {
        const smsHref = `sms:${c.tel}?&body=${encodeURIComponent(c.draft)}`;
        return (
          <div key={c.id} className="cc-card cc-card-pad" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: c.score >= 80 ? "var(--accent-ink)" : c.score >= 60 ? "var(--amber)" : "var(--text-dim)" }}>{c.score}</span>
              <div style={{ flex: 1, minWidth: 140 }}>
                <div style={{ fontWeight: 600, fontSize: 14.5 }}>{c.name}</div>
                <div className="cc-dim" style={{ fontSize: 12.5 }}>{[c.branch, c.city].filter(Boolean).join(" · ")}{c.reviews ? ` · ${c.reviews} anmeldelser` : ""} · {c.tel || c.phone}</div>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, background: "var(--bg-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", whiteSpace: "pre-wrap" }}>{c.draft}</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a className="cc-btn cc-btn-accent" href={smsHref} style={{ textDecoration: "none" }}><Icon name="MessageSquare" style={{ width: 14, height: 14 }} /> Skriv SMS</a>
              {c.tel && <a className="cc-btn" href={`tel:${c.tel}`} style={{ textDecoration: "none" }}><Icon name="Phone" style={{ width: 14, height: 14 }} /> Ring</a>}
              <button className="cc-btn" onClick={() => copy(c.id, c.draft)}>{copied === c.id ? "Kopieret ✓" : "Kopiér udkast"}</button>
              <button className="cc-btn cc-btn-accent" onClick={() => mark(c.id, "sent")} style={{ marginLeft: "auto" }}>Marker sendt</button>
              <button className="cc-btn" onClick={() => mark(c.id, "skipped")}>Spring over</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

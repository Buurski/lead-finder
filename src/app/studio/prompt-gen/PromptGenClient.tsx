"use client";
import { useEffect, useRef, useState } from "react";
import { DESIGN_TEMPLATES } from "@/lib/design-templates";

interface Recon {
  slug: string;
  title: string | null;
  description: string | null;
  toneSample: string | null;
  palette: string[];
  headings: string[];
  images?: string[];
  sources?: string[];
  notes: string[];
}

// Best-effort branch detection from recon text → a DESIGN_TEMPLATES slug.
// Lucas can still override the select; we only nudge it.
const BRANCH_HINTS: { slug: string; words: string[] }[] = [
  { slug: "frisor", words: ["frisør", "barber", "barbershop", "fade", "klip", "hair", "herreklip"] },
  { slug: "salon", words: ["negle", "nail", "manicure", "pedicure", "wax", "voks", "skønhed", "lash", "bryn"] },
  { slug: "hudpleje", words: ["hudpleje", "klinik", "massage", "behandling", "kosmolog", "spa", "ansigtsbehandling"] },
  { slug: "restaurant", words: ["restaurant", "café", "cafe", "kro", "bistro", "brasserie", "pizza", "menu", "køkken", "spisested", "grill", "mad", "bageri"] },
  { slug: "vvs", words: ["vvs", "elektriker", "tømrer", "maler", "blikkenslager", "håndværk", "anlæg", "smed"] },
  { slug: "foto", words: ["foto", "fotograf", "kamera", "portræt", "bryllupsfoto"] },
  { slug: "advokat", words: ["advokat", "revisor", "jura", "rådgiv", "bogføring", "regnskab"] },
];

function inferBranch(r: Recon): string | null {
  const hay = [r.title, r.description, r.toneSample, ...(r.headings ?? []), ...(r.notes ?? [])]
    .filter(Boolean).join(" ").toLowerCase();
  if (!hay.trim()) return null;
  let best: { slug: string; n: number } | null = null;
  for (const h of BRANCH_HINTS) {
    const n = h.words.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0);
    if (n > 0 && (!best || n > best.n)) best = { slug: h.slug, n };
  }
  return best?.slug ?? null;
}

const RECON_MSGS = ["Henter GMB-data…", "Analyserer website…", "Sammenligner kilder…", "Udtrækker farver og tone…"];
const DISPATCH_MSGS = ["Bygger build-prompt…", "Forankrer kulturelt…", "Anti-slop-validering…"];

export default function PromptGenClient() {
  const [name, setName] = useState("");
  const [branch, setBranch] = useState(DESIGN_TEMPLATES[0].slug);
  const [autoBranch, setAutoBranch] = useState(false);
  const [url, setUrl] = useState("");
  const [gmbUrl, setGmbUrl] = useState("");
  const [igNotes, setIgNotes] = useState("");
  const [recon, setRecon] = useState<Recon | null>(null);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "recon" | "dispatch" | "error">("idle");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState(false);

  // Live progress: cycling message + elapsed seconds while a phase runs.
  const [tick, setTick] = useState(0);
  const startRef = useRef(0);
  const busy = phase === "recon" || phase === "dispatch";
  useEffect(() => {
    if (!busy) return;
    startRef.current = Date.now();
    setTick(0);
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);
  const msgs = phase === "dispatch" ? DISPATCH_MSGS : RECON_MSGS;
  const progressMsg = msgs[Math.floor(tick / 4) % msgs.length];

  async function runRecon() {
    setPhase("recon"); setErr(""); setPrompt(null);
    try {
      const res = await fetch("/api/studio/recon-full", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, branch, websiteUrl: url, gmbUrl, igNotes }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "fejl"); setPhase("error"); return; }
      setRecon(d.recon);
      const guess = inferBranch(d.recon);
      if (guess && guess !== branch) { setBranch(guess); setAutoBranch(true); }
      setPhase("idle");
    } catch (e) { setErr(String(e)); setPhase("error"); }
  }

  async function dispatch() {
    setPhase("dispatch"); setErr("");
    try {
      const res = await fetch("/api/studio/dispatch-build", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, branch, websiteUrl: url, gmbUrl, igNotes, templateSlug: branch }),
      });
      const d = await res.json();
      if (!res.ok || d.ok === false) { setErr(d.error ?? "fejl"); setPhase("error"); return; }
      setPrompt(d.prompt); setPhase("idle");
    } catch (e) { setErr(String(e)); setPhase("error"); }
  }

  async function copyPrompt() {
    if (!prompt) return;
    try { await navigator.clipboard.writeText(prompt); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  }

  const canRecon = name.trim().length > 0 || url.trim().length > 0;
  const canDispatch = name.trim().length > 0;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="cc-pg-grid">
          <Labeled label="Kunde-navn">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="fx Guðrun's Goodies" style={inp} />
          </Labeled>
          <Labeled label={autoBranch ? "Branche (auto-detekteret)" : "Branche"}>
            <select value={branch} onChange={(e) => { setBranch(e.target.value); setAutoBranch(false); }} style={inp}>
              {DESIGN_TEMPLATES.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
            </select>
          </Labeled>
        </div>
        <Labeled label="Hjemmeside / FB (valgfrit)">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="fx gudruns.dk eller facebook.com/gudruns" style={inp} />
        </Labeled>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="cc-pg-grid">
          <Labeled label="Google/maps-URL (valgfrit)">
            <input value={gmbUrl} onChange={(e) => setGmbUrl(e.target.value)} placeholder="maps-link" style={inp} />
          </Labeled>
          <Labeled label="IG/FB-noter (indsæt manuelt)">
            <input value={igNotes} onChange={(e) => setIgNotes(e.target.value)} placeholder="farver, stil, du så på IG" style={inp} />
          </Labeled>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="cc-btn" onClick={runRecon} disabled={phase === "recon" || !canRecon} style={{ minWidth: 130, flex: "1 1 auto" }}>
            {phase === "recon" ? "Henter…" : recon ? "Hent recon igen" : "Hent recon"}
          </button>
          <button className="cc-btn cc-btn-accent" onClick={dispatch} disabled={!canDispatch || phase === "dispatch"}
            style={{ background: "var(--red,#c0392b)", color: "#fff", borderColor: "transparent", minWidth: 130, flex: "1 1 auto" }}>
            {phase === "dispatch" ? "Bygger prompt…" : "DISPATCH BUILD"}
          </button>
        </div>
        {busy && (
          <div className="cc-pg-prog" style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
            <span className="cc-pg-dot" />
            <span>{progressMsg}</span>
            <span className="cc-dim" style={{ marginLeft: "auto", fontVariantNumeric: "tabular-nums" }}>{tick}s</span>
          </div>
        )}
        {phase === "error" && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ color: "var(--red)", fontSize: 13 }}>{err}</span>
            <button className="cc-btn" onClick={recon ? dispatch : runRecon} style={{ minWidth: 110 }}>Prøv igen</button>
          </div>
        )}
      </section>

      {recon && (
        <section className="cc-card cc-card-pad">
          <div className="cc-kicker" style={{ marginBottom: 10 }}>Recon ({(recon.sources ?? []).join(", ") || "—"})</div>
          <div style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
            <Row k="Titel" v={recon.title ?? "—"} />
            {recon.headings.length > 0 && <Row k="Overskrifter" v={recon.headings.slice(0, 3).join(" · ")} />}
            {recon.toneSample && <Row k="Tone" v={recon.toneSample.slice(0, 160) + "…"} />}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="cc-dim" style={{ width: 110, flexShrink: 0 }}>Farver</span>
              {recon.palette.length ? recon.palette.map((c) => (
                <span key={c} title={c} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: "1px solid var(--border)" }} />
              )) : <span className="cc-dim">ingen — bruger template-palet</span>}
            </div>
            {(recon.images ?? []).length > 0 && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className="cc-dim" style={{ width: 110, flexShrink: 0 }}>Billeder</span>
                {(recon.images ?? []).slice(0, 6).map((u) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt="" loading="lazy" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                ))}
              </div>
            )}
            {recon.notes.length > 0 && <div className="cc-dim" style={{ fontSize: 12 }}>{recon.notes.join(" · ")}</div>}
          </div>
        </section>
      )}

      {prompt && (
        <section className="cc-card" style={{ overflow: "hidden" }}>
          <div className="cc-pg-done">
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>Build-prompt klar</div>
              <div className="cc-dim" style={{ fontSize: 12.5, marginTop: 2 }}>
                Bygger demoen i <code>demo-sites/{recon?.slug ?? name}</code> · {prompt.length.toLocaleString()} tegn
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={copyPrompt} className="cc-btn cc-btn-accent" style={{ padding: "10px 20px", fontWeight: 700 }}>
                {copied ? "Kopieret ✓" : "Kopiér prompt"}
              </button>
              <button onClick={dispatch} className="cc-btn" disabled={phase === "dispatch"} style={{ padding: "10px 16px" }}>
                Ny variant
              </button>
            </div>
          </div>
          <textarea readOnly value={prompt} style={{ width: "100%", height: 420, border: "none", padding: 14, fontFamily: "ui-monospace, monospace", fontSize: 12, lineHeight: 1.5, background: "var(--bg-2)", color: "var(--text)", resize: "vertical" }} />
          <div className="cc-card-pad" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="cc-dim" style={{ fontSize: 12.5 }}>
              Kør denne prompt i en Claude Code-session (gratis på subscription). Den deployer en privat Vercel-preview. Recon er fenced som untrusted data.
            </span>
          </div>
        </section>
      )}
      <style>{`
        @media (max-width:640px){ .cc-pg-grid{ grid-template-columns:1fr !important; } }
        .cc-pg-prog{ padding:9px 12px; border:1px solid var(--border); border-radius:10px; background:var(--bg-2); }
        .cc-pg-dot{ width:9px; height:9px; border-radius:50%; background:var(--accent,#c98a3a); flex-shrink:0; animation:cc-pg-pulse 1.1s ease-in-out infinite; }
        @keyframes cc-pg-pulse{ 0%,100%{ opacity:.35; transform:scale(.8);} 50%{ opacity:1; transform:scale(1.15);} }
        .cc-pg-done{ display:flex; align-items:center; gap:12px; flex-wrap:wrap; padding:14px 16px; border-bottom:1px solid var(--border); background:color-mix(in srgb, var(--green,#2e9e5b) 12%, transparent); }
        .cc-pg-done > div:first-child{ flex:1 1 200px; }
      `}</style>
    </div>
  );
}

const inp: React.CSSProperties = {
  width: "100%", height: 38, borderRadius: 9, border: "1px solid var(--border)",
  background: "var(--bg-2)", padding: "0 11px", color: "var(--text)", fontSize: 14, fontFamily: "inherit",
};

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span className="cc-kicker">{label}</span>
      {children}
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <span className="cc-dim" style={{ width: 110, flexShrink: 0 }}>{k}</span>
      <span style={{ minWidth: 0 }}>{v}</span>
    </div>
  );
}

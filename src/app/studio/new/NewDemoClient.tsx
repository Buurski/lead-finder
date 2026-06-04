"use client";
import { useState } from "react";
import Icon from "@/components/shell/Icon";
import { DESIGN_TEMPLATES } from "@/lib/design-templates";

interface Recon {
  slug: string;
  resolvedUrl: string | null;
  title: string | null;
  description: string | null;
  ogImage: string | null;
  favicon: string | null;
  themeColor: string | null;
  palette: string[];
  headings: string[];
  toneSample: string | null;
  source: string;
  notes: string[];
}

export default function NewDemoClient() {
  const [name, setName] = useState("");
  const [branch, setBranch] = useState(DESIGN_TEMPLATES[0].slug);
  const [url, setUrl] = useState("");
  const [recon, setRecon] = useState<Recon | null>(null);
  const [phase, setPhase] = useState<"idle" | "recon" | "building" | "built" | "error">("idle");
  const [err, setErr] = useState("");
  const [demo, setDemo] = useState<{ html: string; demoPath: string | null; template: string } | null>(null);

  async function runRecon() {
    setPhase("recon");
    setErr("");
    setDemo(null);
    try {
      const res = await fetch("/api/studio/recon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, name }),
      });
      const d = await res.json();
      if (!res.ok) { setErr(d.error ?? "fejl"); setPhase("error"); return; }
      setRecon(d.recon);
      setPhase("idle");
    } catch (e) {
      setErr(String(e));
      setPhase("error");
    }
  }

  async function build() {
    setPhase("building");
    setErr("");
    try {
      const res = await fetch("/api/studio/build-demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, branch, url }),
      });
      const d = await res.json();
      if (!res.ok || d.ok === false) { setErr(d.error ?? "fejl"); setPhase("error"); return; }
      setDemo({ html: d.html, demoPath: d.demoPath, template: d.template });
      if (d.recon) setRecon(d.recon);
      setPhase("built");
    } catch (e) {
      setErr(String(e));
      setPhase("error");
    }
  }

  const canBuild = name.trim().length > 0;

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <section className="cc-card cc-card-pad" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }} className="cc-new-grid">
          <Labeled label="Kunde-navn">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="fx Salon Lumière" style={inp} />
          </Labeled>
          <Labeled label="Branche">
            <select value={branch} onChange={(e) => setBranch(e.target.value)} style={inp}>
              {DESIGN_TEMPLATES.map((t) => (
                <option key={t.slug} value={t.slug}>{t.label}</option>
              ))}
            </select>
          </Labeled>
        </div>
        <Labeled label="Eksisterende side / FB / IG (valgfrit)">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="fx salonlumiere.dk" style={inp} />
        </Labeled>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="cc-btn" onClick={runRecon} disabled={phase === "recon" || (!url && !name)}>
            {phase === "recon" ? "Henter…" : "Hent recon"}
          </button>
          <button className="cc-btn cc-btn-accent" onClick={build} disabled={!canBuild || phase === "building"}>
            {phase === "building" ? "Bygger…" : "Byg demo"}
          </button>
        </div>
        {phase === "error" && <div style={{ color: "var(--red)", fontSize: 13 }}>{err}</div>}
      </section>

      {recon && (
        <section className="cc-card cc-card-pad">
          <div className="cc-kicker" style={{ marginBottom: 10 }}>Recon ({recon.source})</div>
          <div style={{ display: "grid", gap: 8, fontSize: 13.5 }}>
            <Row k="Titel" v={recon.title ?? "—"} />
            {recon.headings.length > 0 && <Row k="Overskrifter" v={recon.headings.slice(0, 3).join(" · ")} />}
            {recon.toneSample && <Row k="Tone" v={recon.toneSample.slice(0, 160) + "…"} />}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="cc-dim" style={{ width: 110, flexShrink: 0 }}>Farver</span>
              {recon.palette.length ? recon.palette.map((c) => (
                <span key={c} title={c} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: "1px solid var(--border)" }} />
              )) : <span className="cc-dim">ingen fundet — bruger template-palet</span>}
            </div>
            {recon.notes.length > 0 && <div className="cc-dim" style={{ fontSize: 12 }}>{recon.notes.join(" · ")}</div>}
          </div>
        </section>
      )}

      {demo && (
        <section className="cc-card" style={{ overflow: "hidden" }}>
          <div className="cc-card-pad" style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: "1px solid var(--border)" }}>
            <Icon name="LayoutGrid" style={{ width: 17, height: 17, color: "var(--accent-ink)" }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>Demo bygget · {demo.template}-template</span>
            {demo.demoPath && <span className="cc-dim" style={{ marginLeft: "auto", fontSize: 12 }}>{demo.demoPath}</span>}
          </div>
          <iframe title="demo preview" srcDoc={demo.html} style={{ width: "100%", height: 520, border: "none", background: "#fff" }} />
          <div className="cc-card-pad" style={{ borderTop: "1px solid var(--border)" }}>
            <span className="cc-dim" style={{ fontSize: 12.5 }}>Skrevet lokalt. Deploy til Vercel er dit eget skridt — ingen auto-deploy.</span>
          </div>
        </section>
      )}
      <style>{`@media (max-width:640px){ .cc-new-grid{ grid-template-columns:1fr !important; } }`}</style>
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

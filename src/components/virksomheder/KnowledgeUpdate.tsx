"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import "./knowledge.css";

type DiffLine = { t: " " | "+" | "-"; line: string };
type Proposal = { path: string; paths: string[]; isNew: boolean; before: string; after: string; diff: DiffLine[] };

// "Opdatér vidensbase": AI-forslag ud fra CRM-data → se ændringerne → ret → gem i vaulten.
export default function KnowledgeUpdate({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<"" | "forslag" | "gem">("");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState("");
  const [p, setP] = useState<Proposal | null>(null);
  const [text, setText] = useState("");
  const [view, setView] = useState<"diff" | "ret">("diff");

  async function call(body: Record<string, unknown>) {
    const res = await fetch(`/api/virksomheder/${companyId}/viden`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "noget gik galt");
    return data;
  }

  async function propose(path?: string) {
    setBusy("forslag"); setErr(""); setSaved("");
    try {
      const data = (await call({ action: "forslag", path })) as Proposal;
      setP(data); setText(data.after); setView("diff");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "noget gik galt");
    } finally {
      setBusy("");
    }
  }

  async function save() {
    if (!p) return;
    setBusy("gem"); setErr("");
    try {
      await call({ action: "gem", path: p.path, content: text });
      setSaved(`Gemt i ${p.path}`); setP(null);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "noget gik galt");
    } finally {
      setBusy("");
    }
  }

  const changes = p ? p.diff.filter((d) => d.t !== " ").length : 0;

  return (
    <div className="kb">
      {!p && (
        <div className="kb-row">
          <button className="cc-btn" onClick={() => propose()} disabled={busy !== ""}>
            {busy === "forslag" ? "Laver forslag…" : "Opdatér vidensbase"}
          </button>
          <span className="kb-hint">{saved || "AI foreslår en opdateret kundenote ud fra det, der står i CRM'et. Intet gemmes, før du trykker gem."}</span>
        </div>
      )}
      {err && <p className="kb-err" role="alert">{err}</p>}
      {p && (
        <div className="kb-panel">
          <div className="kb-row">
            {p.paths.length > 1 ? (
              <label className="kb-hint">
                Note{" "}
                <select className="cc-input kb-select" value={p.path} onChange={(e) => propose(e.target.value)} disabled={busy !== ""}>
                  {p.paths.map((x) => <option key={x} value={x}>{x.replace("wiki/kunder/", "")}</option>)}
                </select>
              </label>
            ) : (
              <span className="kb-path">{p.isNew ? `Ny note: ${p.path}` : p.path}</span>
            )}
            <span className="kb-hint">{changes === 0 ? "Ingen ændringer foreslået." : `${changes} linjer ændret`}</span>
            <div className="kb-tabs" role="tablist">
              <button role="tab" aria-selected={view === "diff"} className="kb-tab" data-active={view === "diff"} onClick={() => setView("diff")}>Ændringer</button>
              <button role="tab" aria-selected={view === "ret"} className="kb-tab" data-active={view === "ret"} onClick={() => setView("ret")}>Ret teksten</button>
            </div>
          </div>
          {view === "diff" ? (
            <pre className="kb-diff" aria-label="Foreslåede ændringer">
              {p.diff.map((d, i) => (
                <span key={i} className="kb-line" data-t={d.t === "+" ? "add" : d.t === "-" ? "del" : "same"}>
                  {d.t === " " ? "  " : `${d.t} `}{d.line}{"\n"}
                </span>
              ))}
            </pre>
          ) : (
            <textarea className="cc-input kb-text" value={text} onChange={(e) => setText(e.target.value)} aria-label="Opdateret kundenote" rows={18} />
          )}
          <div className="kb-row kb-actions">
            <button className="cc-btn" onClick={() => setP(null)} disabled={busy !== ""}>Annullér</button>
            <button className="cc-btn cc-btn-accent" onClick={save} disabled={busy !== "" || changes === 0 && text === p.after}>
              {busy === "gem" ? "Gemmer…" : "Gem i vaulten"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

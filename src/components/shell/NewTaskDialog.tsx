"use client";
// "Ny opgave"-dialog: fra "+ Ny" globalt (virksomhed valgfri) og fra kundeprofilen
// (virksomheden forudvalgt). Opretter via POST /api/opgaver.
import { useEffect, useRef, useState, type FormEvent } from "react";
import Icon from "./Icon";
import "./quick-actions.css";

export default function NewTaskDialog({
  initialCompany, defaultOwner = "lucas", onClose, onCreated,
}: {
  initialCompany?: { id: string; name: string };
  defaultOwner?: "lucas" | "charlie";
  onClose: () => void;
  onCreated: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; city: string }[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(initialCompany ?? null);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState<"lucas" | "charlie">(defaultOwner);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  useEffect(() => {
    if (picked || !query.trim()) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/virksomheder/search?q=${encodeURIComponent(query.trim())}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((rows: { id: string; name: string; city: string }[]) => setResults(rows))
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, picked]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError("Skriv hvad der skal gøres"); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/opgaver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), owner, due: due || undefined, companyId: picked?.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke oprettes");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "kunne ikke oprettes");
      setSaving(false);
    }
  }

  return (
    <div className="qa-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="qa-dialog" role="dialog" aria-modal="true" aria-labelledby="qa-task-title" onSubmit={submit}>
        <div className="qa-dialog-head">
          <h2 id="qa-task-title">Ny opgave{initialCompany ? ` · ${initialCompany.name}` : ""}</h2>
          <button type="button" className="qa-close-btn cc-focus" onClick={onClose} aria-label="Luk">
            <Icon name="X" style={{ width: 18, height: 18 }} />
          </button>
        </div>

        <div className="qa-field">
          <label htmlFor="qa-task-text">Hvad skal gøres?</label>
          <input id="qa-task-text" ref={titleRef} className="qa-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Fx Ring til Allan om prisen" />
        </div>

        {!initialCompany && (
          <div className="qa-field">
            <label htmlFor="qa-task-company">Virksomhed (valgfri)</label>
            {picked ? (
              <div className="qa-picked">
                {picked.name}
                <button type="button" onClick={() => { setPicked(null); setQuery(""); }} aria-label="Fjern valgt virksomhed">
                  <Icon name="X" style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ) : (
              <div className="qa-search-wrap">
                <input id="qa-task-company" className="qa-input" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setResults([]); }} placeholder="Søg virksomhed…" autoComplete="off" />
                {results.length > 0 && (
                  <div className="qa-search-results">
                    {results.map((c) => (
                      <button key={c.id} type="button" className="qa-search-result" onClick={() => { setPicked(c); setResults([]); }}>
                        {c.name}{c.city && <span className="city">{c.city}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="qa-field">
            <label htmlFor="qa-task-due">Hvornår</label>
            <input id="qa-task-due" type="date" className="qa-input" style={{ width: 170 }} value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
          <fieldset className="qa-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 6 }}>Hvem</legend>
            <div style={{ display: "flex", gap: 12 }}>
              {(["lucas", "charlie"] as const).map((o) => (
                <label key={o} className="qa-checkbox">
                  <input type="radio" name="qa-task-owner" checked={owner === o} onChange={() => setOwner(o)} />
                  {o === "lucas" ? "Lucas" : "Charlie"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {error && <p className="qa-error">{error}</p>}

        <div className="qa-dialog-actions">
          <button type="button" className="cc-btn cc-focus" onClick={onClose}>Annuller</button>
          <button type="submit" className="cc-btn cc-btn-accent cc-focus" disabled={saving}>{saving ? "Opretter…" : "Opret opgave"}</button>
        </div>
      </form>
    </div>
  );
}

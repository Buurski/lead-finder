"use client";
// "Log arbejde"-dialog: samme handling som Timeline.tsx' inline-logger med
// type fastlåst til "arbejde", men som en selvstændig dialog så den kan åbnes
// fra kundeprofilens header og fra "+ Ny" globalt (med virksomhedsvælger).
import { useEffect, useRef, useState, type FormEvent } from "react";
import Icon from "./Icon";
import "./quick-actions.css";

export interface LoggedWork {
  companyId: string;
  companyName: string;
}

export default function LogWorkDialog({
  initialCompany, onClose, onLogged, onError,
}: {
  initialCompany?: { id: string; name: string };
  onClose: () => void;
  onLogged: (result: LoggedWork) => void;
  onError?: (msg: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; city: string }[]>([]);
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(initialCompany ?? null);
  const [summary, setSummary] = useState("");
  const [amount, setAmount] = useState("");
  const [kundeSynlig, setKundeSynlig] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const companyRef = useRef<HTMLInputElement>(null);
  const summaryRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (initialCompany ? summaryRef.current : companyRef.current)?.focus();
  }, [initialCompany]);

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
    if (!picked) { setError("Vælg en virksomhed"); return; }
    const text = summary.trim();
    if (!text) { setError("Skriv hvad der blev lavet"); return; }
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/virksomheder/${picked.id}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "arbejde",
          summary: text,
          billableDkk: amount ? Number(amount) : undefined,
          kundeSynlig,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke logges");
      onLogged({ companyId: picked.id, companyName: picked.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "kunne ikke logges";
      setError(msg);
      onError?.(msg);
      setSaving(false);
    }
  }

  return (
    <div className="qa-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="qa-dialog" role="dialog" aria-modal="true" aria-labelledby="qa-work-title" onSubmit={submit}>
        <div className="qa-dialog-head">
          <h2 id="qa-work-title">Log arbejde</h2>
          <button type="button" className="qa-close-btn cc-focus" onClick={onClose} aria-label="Luk">
            <Icon name="X" style={{ width: 18, height: 18 }} />
          </button>
        </div>

        {!initialCompany && (
          <div className="qa-field">
            <label htmlFor="qa-work-company">Virksomhed</label>
            {picked ? (
              <div className="qa-picked">
                {picked.name}
                <button type="button" onClick={() => { setPicked(null); setQuery(""); }} aria-label="Fjern valgt virksomhed">
                  <Icon name="X" style={{ width: 14, height: 14 }} />
                </button>
              </div>
            ) : (
              <div className="qa-search-wrap">
                <input
                  id="qa-work-company"
                  ref={companyRef}
                  className="qa-input"
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setResults([]); }}
                  placeholder="Søg virksomhed…"
                  autoComplete="off"
                />
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

        <div className="qa-field">
          <label htmlFor="qa-work-summary">Hvad blev lavet?</label>
          <textarea
            id="qa-work-summary"
            ref={summaryRef}
            className="qa-textarea"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Fx Ny forside med billeder fra værkstedet"
          />
        </div>

        <label className="qa-checkbox">
          <input type="checkbox" checked={kundeSynlig} onChange={(e) => setKundeSynlig(e.target.checked)} />
          Kunden må se det (kommer med i næste kundeopdatering)
        </label>

        <div className="qa-field">
          <label htmlFor="qa-work-amount">Beløb (kr, valgfrit)</label>
          <input id="qa-work-amount" className="qa-input" style={{ width: 160 }} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" />
        </div>

        {error && <p className="qa-error">{error}</p>}

        <div className="qa-dialog-actions">
          <button type="button" className="cc-btn cc-focus" onClick={onClose}>Annuller</button>
          <button type="submit" className="cc-btn cc-btn-accent cc-focus" disabled={saving}>{saving ? "Logger…" : "Log arbejde"}</button>
        </div>
      </form>
    </div>
  );
}

"use client";
// Hurtig-tilføj-linje øverst på /opgaver: titel + valgfri virksomhed + dato +
// ejer. Enter opretter. Virksomhedssøgning genbruger /api/virksomheder/search
// (samme debounce-mønster som MergePanel).
import { useEffect, useRef, useState } from "react";

interface CompanyHit { id: string; name: string }

export default function QuickAdd({ defaultOwner, today, onCreated }: { defaultOwner: string; today: string; onCreated: (msg: string) => void }) {
  const [title, setTitle] = useState("");
  // I dag som standard — ellers lander opgaven under "Uden dato" og er usynlig i "Min dag" (Lucas 23/9).
  const [due, setDue] = useState(today);
  const [owner, setOwner] = useState(defaultOwner || "lucas");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CompanyHit[]>([]);
  const [picked, setPicked] = useState<CompanyHit | null>(null);
  const [showHits, setShowHits] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (picked || q.trim().length < 2) return; // render gate (q.length) hides stale hits — se MergePanel.tsx
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/virksomheder/search?q=${encodeURIComponent(q.trim())}`);
        setHits(res.ok ? await res.json() : []);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, picked]);

  async function submit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/opgaver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), due: due || undefined, owner, companyId: picked?.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke oprette opgaven");
      const where = !due ? "under Alle (uden dato)" : due === today ? "i Min dag" : `under Alle (${due})`;
      setTitle(""); setDue(today); setQ(""); setPicked(null); setShowHits(false);
      onCreated(`Opgave tilføjet — ligger ${where}.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "kunne ikke oprette opgaven");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="op-quickadd">
      <div className="op-quickadd-row">
        <input
          className="op-input"
          style={{ flex: 1.4 }}
          value={title}
          placeholder="Ny opgave…"
          aria-label="Opgavetitel"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <div className="op-company-picker">
          <input
            className="op-input"
            value={picked ? picked.name : q}
            placeholder="Virksomhed (valgfri)…"
            aria-label="Virksomhed"
            onChange={(e) => { setPicked(null); setQ(e.target.value); setShowHits(true); }}
            onFocus={() => setShowHits(true)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
          />
          {showHits && !picked && q.trim().length >= 2 && hits.length > 0 && (
            <ul className="op-company-hits">
              {hits.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => { setPicked(h); setShowHits(false); }}>{h.name}</button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <input
          className="op-input op-input-date"
          type="date"
          value={due}
          aria-label="Forfaldsdato"
          onChange={(e) => setDue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        />
        <select className="op-input op-input-owner" value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Ejer">
          <option value="lucas">Lucas</option>
          <option value="charlie">Charlie</option>
        </select>
        <button type="button" className="cc-btn cc-btn-accent" onClick={submit} disabled={busy || !title.trim()}>
          {busy ? "Tilføjer…" : "Tilføj"}
        </button>
      </div>
      {err && <span className="op-quickadd-err">{err}</span>}
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lifecycleChipStyle, lifecycleLabel } from "./lifecycle";

interface Hit { id: string; name: string; city: string; lifecycle: string; clientNo: number | null; rowNo: number }
interface Self { id: string; name: string; city: string; lifecycle: string; clientNo: number | null; rowNo: number }

// Spejler serverens vinder-regel i src/lib/pg/merge.ts (mergeCompanies): den
// med en rigtig lead-række (row_no > 0) beholdes altid, og kundens navn +
// nummer følger med uanset hvem der beholdes. Rent visnings-formål — selve
// fletningen afgøres stadig af serveren.
function predictMergeResult(self: Self, other: Hit): { name: string; clientNo: number | null; bothClients: boolean } {
  let keep: Self | Hit = self;
  let drop: Self | Hit = other;
  if (drop.rowNo > 0 && keep.rowNo <= 0) [keep, drop] = [drop, keep];
  let name = keep.name;
  let clientNo = keep.clientNo;
  if (keep.clientNo === null && drop.clientNo !== null) {
    name = drop.name;
    clientNo = drop.clientNo;
  }
  return { name, clientNo, bothClients: self.clientNo !== null && other.clientNo !== null };
}

export default function MergePanel({ self }: { self: Self }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open || picked) return;
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) return; // rendering gates on length, so stale hits never show
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/virksomheder/search?q=${encodeURIComponent(q.trim())}&exclude=${self.id}`);
        setHits(res.ok ? await res.json() : []);
      } catch {
        setHits([]);
      }
    }, 250);
    return () => { if (debounce.current) clearTimeout(debounce.current); };
  }, [q, open, picked, self.id]);

  async function confirmMerge() {
    if (!picked) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/virksomheder/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keepId: self.id, dropId: picked.id }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "fletningen fejlede");
      setOpen(false);
      setPicked(null);
      setQ("");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "fletningen fejlede");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button className="cc-btn virk-btn-press" onClick={() => setOpen(true)}>
        Flet med…
      </button>
    );
  }

  return (
    <div className="cc-card cc-card-pad virk-panel-in" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="virk-section-title">
        <span>Flet virksomheder</span>
        <button className="cc-btn virk-btn-press" onClick={() => { setOpen(false); setPicked(null); setQ(""); setErr(""); }} aria-label="Luk">
          Luk
        </button>
      </div>

      {!picked ? (
        <>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg den anden virksomhed…"
            aria-label="Søg efter virksomhed at flette med"
            style={{ height: 36, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", padding: "0 10px", fontSize: 13, color: "var(--text)" }}
          />
          {q.trim().length >= 2 && hits.length > 0 && (
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    className="cc-btn virk-btn-press"
                    style={{ width: "100%", justifyContent: "flex-start", textAlign: "left" }}
                    onClick={() => setPicked(h)}
                  >
                    <span style={{ fontWeight: 600 }}>{h.name}</span>
                    <span style={{ color: "var(--text-dim)", marginLeft: 8 }}>{h.city}</span>
                    <span className="cc-chip" style={{ ...lifecycleChipStyle(h.lifecycle), marginLeft: "auto" }}>{lifecycleLabel(h.lifecycle)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {q.trim().length >= 2 && hits.length === 0 && <p className="cc-dim" style={{ fontSize: 12.5 }}>Ingen match.</p>}
        </>
      ) : (
        <>
          <div className="virk-merge-cols">
            <div className="virk-merge-card">
              <div className="cc-kicker">Denne virksomhed</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{self.name}</div>
              <div className="cc-dim" style={{ fontSize: 12.5 }}>{self.city || "–"}</div>
              {self.clientNo !== null && <div className="cc-dim" style={{ fontSize: 12.5 }}>Kunde #{self.clientNo}</div>}
            </div>
            <div className="virk-merge-card">
              <div className="cc-kicker">Flettes sammen med</div>
              <div style={{ fontWeight: 600, marginTop: 4 }}>{picked.name}</div>
              <div className="cc-dim" style={{ fontSize: 12.5 }}>{picked.city || "–"}</div>
              {picked.clientNo !== null && <div className="cc-dim" style={{ fontSize: 12.5 }}>Kunde #{picked.clientNo}</div>}
            </div>
          </div>
          {(() => {
            const result = predictMergeResult(self, picked);
            if (result.bothClients) {
              return (
                <p style={{ color: "var(--red)", fontSize: 12.5 }}>
                  Begge har et kundenummer — det kan ikke flettes automatisk. Ryd kundenummeret på en af dem først.
                </p>
              );
            }
            return (
              <p className="cc-dim" style={{ fontSize: 12 }}>
                Den samlede virksomhed bliver <strong style={{ color: "var(--text)" }}>{result.name}</strong>
                {result.clientNo !== null && <> · Kunde #{result.clientNo}</>}. Aftaler, kontakter, tidslinje og fakturaer samles
                her — den anden arkiveres, intet slettes.
              </p>
            );
          })()}
          {err && <p style={{ color: "var(--red)", fontSize: 12.5 }}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <button className="cc-btn cc-btn-accent virk-btn-press" onClick={confirmMerge} disabled={busy || predictMergeResult(self, picked).bothClients}>
              {busy ? "Fletter…" : "Bekræft fletning"}
            </button>
            <button className="cc-btn virk-btn-press" onClick={() => setPicked(null)} disabled={busy}>
              Vælg en anden
            </button>
          </div>
        </>
      )}
    </div>
  );
}

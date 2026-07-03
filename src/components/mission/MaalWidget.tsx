"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "@/components/shell/Icon";

interface Goal {
  done: boolean;
  text: string;
}

// Mission Control-widget (Bundle G): de næste ubookede 90-dages mål fra
// vaulten (wiki/os/roadmap-naeste-skridt.md via /api/goals). Toggle virker
// direkte herfra — samme backend som /goals, optimistisk UI med rollback.
const SHOW = 5;

export default function MaalWidget() {
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/goals")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.ok && Array.isArray(d.goals)) setGoals(d.goals);
        else setError("Kunne ikke hente mål fra vaulten.");
      })
      .catch(() => alive && setError("Kunne ikke hente mål fra vaulten."));
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(text: string) {
    if (!goals) return;
    setBusy(true);
    setError(null);
    const prev = goals;
    setGoals(goals.map((g) => (g.text === text ? { ...g, done: !g.done } : g)));
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) {
        setGoals(prev);
        setError(d.error ?? "Kunne ikke gemme — prøv igen.");
      } else if (Array.isArray(d.goals)) {
        setGoals(d.goals);
      }
    } catch {
      setGoals(prev);
      setError("Kunne ikke nå serveren — prøv igen.");
    } finally {
      setBusy(false);
    }
  }

  const open = (goals ?? []).filter((g) => !g.done).slice(0, SHOW);
  const doneCount = (goals ?? []).filter((g) => g.done).length;

  return (
    <section className="cc-card cc-card-pad" aria-label="Næste mål">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600 }}>Næste mål</h2>
        <Link href="/goals" className="cc-link" style={{ fontSize: 12 }}>
          Alle mål →
        </Link>
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--danger, #b4453a)", marginBottom: 8 }}>{error}</div>}

      {goals === null && !error && <div className="cc-dim" style={{ fontSize: 13 }}>Henter fra vaulten…</div>}

      {goals !== null && open.length === 0 && (
        <div className="cc-dim" style={{ fontSize: 13 }}>
          {goals.length === 0 ? "Ingen mål i vaulten endnu — tilføj på /goals." : `Alle ${goals.length} mål er klaret.`}
        </div>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 8 }}>
        {open.map((g) => (
          <li key={g.text} style={{ display: "flex", gap: 9, alignItems: "flex-start", fontSize: 13.5 }}>
            <button
              onClick={() => toggle(g.text)}
              disabled={busy}
              aria-label={`Marker som klaret: ${g.text}`}
              style={{
                width: 16,
                height: 16,
                borderRadius: 4,
                flexShrink: 0,
                marginTop: 2,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                background: "var(--bg-3)",
                border: "1px solid var(--border-strong)",
              }}
            >
              <Icon name="CheckCheck" style={{ width: 10, height: 10, color: "transparent" }} />
            </button>
            <span style={{ flex: 1, lineHeight: 1.45 }}>{g.text}</span>
          </li>
        ))}
      </ul>

      {goals !== null && goals.length > 0 && (
        <p className="cc-dim" style={{ fontSize: 11.5, margin: "10px 0 0" }}>
          {doneCount} / {goals.length} klaret · redigér på <Link href="/goals" className="cc-link">/goals</Link>
        </p>
      )}
    </section>
  );
}

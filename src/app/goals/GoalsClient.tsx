"use client";
import { useState } from "react";
import Icon from "@/components/shell/Icon";

interface Goal {
  done: boolean;
  text: string;
}

// Interactive 90-day goal list. Every change commits to the live vault note
// (wiki/os/roadmap-naeste-skridt.md) via /api/goals — Obsidian and Hermes see
// the same list. Optimistic UI with rollback on failure.
export default function GoalsClient({ initialGoals }: { initialGoals: Goal[] }) {
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [newGoal, setNewGoal] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const done = goals.filter((g) => g.done).length;
  const pct = goals.length ? Math.round((done / goals.length) * 100) : 0;

  async function call(action: "toggle" | "add" | "remove", text: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/goals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) {
        setError(d.error ?? "Kunne ikke gemme — prøv igen.");
        return false;
      }
      if (Array.isArray(d.goals)) setGoals(d.goals);
      return true;
    } catch {
      setError("Kunne ikke nå serveren — prøv igen.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cc-card cc-card-pad">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600 }}>90-dages mål</h2>
        <span className="cc-dim" style={{ fontSize: 13 }}>{done} / {goals.length} klaret</span>
      </div>
      <div style={{ height: 8, borderRadius: 999, background: "var(--bg-3)", overflow: "hidden", marginBottom: 18 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "var(--accent)", borderRadius: 999, transition: "width 400ms cubic-bezier(0.22,1,0.36,1)" }} />
      </div>

      {error && (
        <div style={{ fontSize: 12.5, color: "var(--danger, #b4453a)", marginBottom: 10 }}>{error}</div>
      )}

      {goals.length === 0 && !error && (
        <div className="cc-empty">
          <Icon name="Target" />
          <div style={{ fontSize: 13 }}>Ingen mål endnu. Tilføj det første nedenfor — listen gemmes i vaulten.</div>
        </div>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 9 }}>
        {goals.map((g) => (
          <li key={g.text} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14 }}>
            <button
              onClick={() => call("toggle", g.text)}
              disabled={busy}
              aria-label={g.done ? `Genåbn: ${g.text}` : `Marker som klaret: ${g.text}`}
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                background: g.done ? "var(--accent)" : "var(--bg-3)",
                border: g.done ? "none" : "1px solid var(--border-strong)",
              }}
            >
              {g.done && <Icon name="CheckCheck" style={{ width: 12, height: 12, color: "#fff" }} />}
            </button>
            <span style={{ color: g.done ? "var(--text-dim)" : "var(--text)", textDecoration: g.done ? "line-through" : "none", flex: 1 }}>
              {g.text}
            </span>
            <button
              onClick={() => {
                if (window.confirm(`Fjern målet "${g.text}"?`)) call("remove", g.text);
              }}
              disabled={busy}
              aria-label={`Fjern: ${g.text}`}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-dim)", padding: 2, display: "grid", placeItems: "center" }}
            >
              <Icon name="X" style={{ width: 13, height: 13 }} />
            </button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const t = newGoal.trim();
          if (!t) return;
          if (await call("add", t)) setNewGoal("");
        }}
        style={{ display: "flex", gap: 8, marginTop: 16 }}
      >
        <input
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          placeholder="Nyt mål…"
          disabled={busy}
          aria-label="Nyt mål"
          maxLength={300}
          style={{ flex: 1, minWidth: 0, border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", fontSize: 13, background: "var(--surface)", color: "var(--text)", fontFamily: "var(--font-body)" }}
        />
        <button type="submit" className="cc-btn" disabled={busy || !newGoal.trim()} style={{ padding: "0 14px" }}>
          Tilføj
        </button>
      </form>
      <p className="cc-dim" style={{ fontSize: 11.5, margin: "10px 0 0" }}>
        Ændringer committes direkte til vaulten (roadmap-naeste-skridt.md) — Obsidian og Hermes ser det samme.
        Du kan også bede Claude nede i hjørnet: “tilføj mål: …”.
      </p>
    </section>
  );
}

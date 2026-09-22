"use client";
import { useState } from "react";

// Engangs-værktøj til fase 1-cutover: tørkør (rapport) og kør (skriv til Postgres).
export default function MigreringClient() {
  const [busy, setBusy] = useState<"dry" | "apply" | null>(null);
  const [out, setOut] = useState<string>("");

  async function run(mode: "dry" | "apply") {
    if (mode === "apply" && !confirm("Skriv alle leads, kunder, kø, fakturaer og CRM til Postgres? (Kilderne ændres ikke.)")) return;
    setBusy(mode);
    setOut("");
    try {
      const res = await fetch(`/api/admin/migrate-pg?mode=${mode}`, { method: "POST" });
      setOut(JSON.stringify(await res.json(), null, 2));
    } catch (err) {
      setOut(String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 16, maxWidth: 900 }}>
      <h1 style={{ margin: 0 }}>Migrering til Postgres</h1>
      <p style={{ margin: 0 }}>Tørkør viser tal og dubletter uden at skrive. Kør flytter alt — kan køres flere gange.</p>
      <div style={{ display: "flex", gap: 12 }}>
        <button className="cc-btn" disabled={busy !== null} onClick={() => run("dry")}>{busy === "dry" ? "Tørkører…" : "Tørkør"}</button>
        <button className="cc-btn" disabled={busy !== null} onClick={() => run("apply")}>{busy === "apply" ? "Kører…" : "Kør migrering"}</button>
      </div>
      {out && <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: "60vh", overflow: "auto" }}>{out}</pre>}
    </main>
  );
}

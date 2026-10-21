"use client";
// "Opdatér" på et opdateringskort (Lucas 20/10, mulighed A): flytter det udgivne indlæg
// tilbage til Arbejder med en besked til Hermes. Guards (kun menneske, max 2/uge,
// låst slug) ligger i updatePost — knappen viser bare serverens svar.
import { useState } from "react";

export default function UpdatePostButton({ id, queries }: { id: string; queries: string[] }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  async function send() {
    if (!confirm("Send indlægget til Hermes som opdatering? Den nuværende version bliver live, indtil du merger den nye.")) return;
    setState("busy");
    const instructions = `Opdatér det udgivne indlæg (samme slug) så det rammer: ${queries.join(", ") || "søgningerne i Google"}. Behold det der virker, gør svaret skarpere, og tjek fakta igen.`;
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stage: "arbejder", instructions }) });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return setState("done");
      setError(String(data.error ?? `HTTP ${res.status}`));
      setState("error");
    } catch {
      setError("kunne ikke nå HQ");
      setState("error");
    }
  }
  if (state === "done") return <a href="/blog" className="cc-btn konk-action-done">✓ Sendt til Hermes</a>;
  return <>
    <button type="button" className="cc-btn cc-btn-accent" disabled={state === "busy"} onClick={send}>{state === "busy" ? "…" : "Opdatér"}</button>
    {state === "error" && <span className="konk-finding-error">{error}</span>}
  </>;
}

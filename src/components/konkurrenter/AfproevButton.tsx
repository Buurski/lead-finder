"use client";
// "→ Afprøv hos os" — sender et fund (konkurrent-siden) eller et næste skridt (SEO-fanen)
// til Pipeline → Tests. Hermes vurderer selv i nat; ingen feedback-støj her.
import { useState } from "react";
import type { ExperimentSource } from "@/lib/hq/experiments";

export default function AfproevButton({ title, detail, source }: { title: string; detail: string; source: ExperimentSource }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [error, setError] = useState("");
  async function send() {
    setState("busy");
    setError("");
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", test: { title: title.slice(0, 120), detail: detail.slice(0, 1000), source } }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "kunne ikke sende til Tests");
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "kunne ikke sende til Tests");
    }
  }
  if (state === "done") return <a href="/tests" className="cc-btn konk-action-done">✓ Sendt til Tests</a>;
  return <>
    <button type="button" className="cc-btn" disabled={state === "busy"} onClick={send}>{state === "busy" ? "…" : "→ Afprøv hos os"}</button>
    {state === "error" && <span className="konk-finding-error">{error}</span>}
  </>;
}

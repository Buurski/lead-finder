"use client";
// "→ Blog-idé" på SEO-fanens handlinger — samme POST /api/posts som KonkurrenterBoard.
import { useState } from "react";

export default function BlogIdeaButton({ title, note, category }: { title: string; note: string; category: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function send() {
    setState("busy");
    try {
      const res = await fetch("/api/posts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: title.slice(0, 60), note: note.slice(0, 300), category }) });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }
  if (state === "done") return <a href="/blog" className="cc-btn konk-action-done">✓ Sendt til Blog</a>;
  return <>
    <button type="button" className="cc-btn cc-btn-accent" disabled={state === "busy"} onClick={send}>{state === "busy" ? "…" : "→ Blog-idé"}</button>
    {state === "error" && <span className="konk-finding-error">Kunne ikke oprette idéen</span>}
  </>;
}

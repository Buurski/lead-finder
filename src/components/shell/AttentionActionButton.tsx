"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { AttentionAction } from "@/lib/hq/overview";
import "./attention.css";

// Et-kliks-handling på et opmærksomhedspunkt ("Klaret", "Markér betalt").
// Kalder den eksisterende UI-rute og genindlæser siden, så punktet forsvinder
// alle steder (forside, klokke, kundeprofil, fakturaer) fra samme kilde.
export default function AttentionActionButton({ action, onDone }: { action: AttentionAction; onDone?: () => void }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [err, setErr] = useState("");

  async function run(e: React.MouseEvent) {
    e.preventDefault(); // knappen sidder ved siden af et link — må ikke navigere
    e.stopPropagation();
    setState("busy");
    setErr("");
    try {
      const res = await fetch(action.url, {
        method: action.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action.body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "kunne ikke gemme");
      setState("done");
      onDone?.();
      router.refresh();
    } catch (e2) {
      setState("error");
      setErr(e2 instanceof Error ? e2.message : "kunne ikke gemme");
    }
  }

  return (
    <span className="attn-action">
      <button type="button" className="cc-btn attn-action-btn" disabled={state === "busy" || state === "done"} onClick={run}>
        {state === "done" ? "✓ Gemt" : state === "busy" ? "Gemmer…" : action.label}
      </button>
      {state === "error" && <span className="attn-action-err" role="alert">{err}</span>}
    </span>
  );
}

"use client";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";

export default function VerifyAllButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");

  async function handleClick() {
    if (state === "loading") return;
    setState("loading");
    setError("");
    try {
      const res = await fetch("/api/verify-all", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fejl");
      setCount(data.verified);
      setState("done");
      // Reload after 2s so updated scores/tiers appear
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukendt fejl");
      setState("error");
      setTimeout(() => setState("idle"), 5000);
    }
  }

  const label =
    state === "loading" ? "Verificerer..." :
    state === "done"    ? `✓ ${count} verificeret` :
    state === "error"   ? `Fejl: ${error}` :
    "Verificer alle";

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading"}
      title="Analyser hjemmesider for alle leads og opdater scores"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "transparent",
        color: state === "error" ? "#dc2626" : state === "done" ? "var(--green)" : "var(--text-muted)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 14px",
        fontSize: 12,
        fontWeight: 600,
        cursor: state === "loading" ? "default" : "pointer",
        opacity: state === "loading" ? 0.6 : 1,
        transition: "color 0.2s, border-color 0.2s",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={e => {
        if (state === "idle") (e.currentTarget as HTMLElement).style.borderColor = "var(--border-light)";
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      <ShieldCheck size={13} />
      {label}
    </button>
  );
}

"use client";
import { useState } from "react";

export default function ScrapeButton({ onDone }: { onDone?: (added: number) => void }) {
  const [status, setStatus] = useState<"idle" | "scraping" | "verifying" | "done" | "error">("idle");
  const [added, setAdded] = useState(0);
  const [error, setError] = useState("");

  async function handleClick() {
    setStatus("scraping");
    setError("");
    try {
      const res = await fetch("/api/scrape", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Fejl");
      setAdded(data.added);

      if (data.added > 0) {
        setStatus("verifying");
        await fetch("/api/verify-all", { method: "POST" });
      }

      setStatus("done");
      onDone?.(data.added);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukendt fejl");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  }

  const label =
    status === "scraping"  ? "Henter leads..." :
    status === "verifying" ? "Verificerer..." :
    status === "done"      ? `✓ ${added} nye leads` :
    status === "error"     ? `Fejl: ${error}` :
    "+ Hent leads";

  const busy = status === "scraping" || status === "verifying";

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      style={{
        background: status === "error" ? "#dc2626" : "var(--green)",
        color: "#fff",
        border: "none",
        borderRadius: 8,
        padding: "9px 18px",
        fontSize: 13,
        fontWeight: 700,
        cursor: busy ? "default" : "pointer",
        letterSpacing: "0.01em",
        boxShadow: "0 0 0 1px #22c55e40, 0 2px 12px #22c55e30",
        opacity: busy ? 0.7 : 1,
        transition: "opacity 0.15s, background 0.2s",
        minWidth: 140,
      }}
    >
      {label}
    </button>
  );
}

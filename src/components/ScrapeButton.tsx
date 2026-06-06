"use client";
import { useState } from "react";

// Auto-sweep: scrape ALL of Denmark without one giant timeout-prone call. The full
// branches×cities sweep (~1300 queries) blows the Vercel 300s limit, so we loop the
// region×branch-preset chunks SEQUENTIALLY (each its own bounded request, own 300s
// budget) and accumulate. Beauty first (Lucas weights it up), then food/craft/prof.
// New leads are composite-scored server-side; already-known names/phones are skipped
// (so contacted leads never re-enter).
const REGIONS = ["aarhus", "odense", "esbjerg", "aalborg", "midt"];
const BRANCHES = ["beauty", "food", "craft", "professional"];

export default function ScrapeButton({ onDone }: { onDone?: (added: number) => void }) {
  const [status, setStatus] = useState<"idle" | "scraping" | "verifying" | "done" | "error">("idle");
  const [added, setAdded] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: REGIONS.length * BRANCHES.length });
  const [error, setError] = useState("");

  async function handleClick() {
    setStatus("scraping");
    setError("");
    setAdded(0);
    let total = 0;
    let i = 0;
    for (const region of REGIONS) {
      for (const branch of BRANCHES) {
        i++;
        setProgress({ done: i, total: REGIONS.length * BRANCHES.length });
        try {
          const res = await fetch(`/api/scrape?region=${region}&branch=${branch}`, { method: "POST" });
          const data = await res.json().catch(() => ({}));
          if (res.ok && typeof data.added === "number") {
            total += data.added;
            setAdded(total);
          }
        } catch {
          /* skip this chunk, keep sweeping */
        }
      }
    }
    try {
      if (total > 0) {
        setStatus("verifying");
        await fetch("/api/verify-all", { method: "POST" });
      }
      setStatus("done");
      onDone?.(total);
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ukendt fejl");
      setStatus("error");
      setTimeout(() => setStatus("idle"), 5000);
    }
  }

  const label =
    status === "scraping"  ? `Henter… ${progress.done}/${progress.total} (${added} nye)` :
    status === "verifying" ? "Verificerer…" :
    status === "done"      ? `✓ ${added} nye leads` :
    status === "error"     ? `Fejl: ${error}` :
    "+ Hent leads (auto, hele DK)";

  const busy = status === "scraping" || status === "verifying";

  return (
    <button
      onClick={handleClick}
      disabled={busy}
      title="Skraber alle relevante brancher i alle danske regioner, composite-scorer dem, og springer allerede-kendte over."
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

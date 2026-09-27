"use client";
// Hermes' oprydnings-forslag over Idéer-kolonnen (blog_ide_oprydning.py, hver 2. uge).
// Kun forslag: Lucas sletter (eksisterende DELETE /api/posts/[id]) eller beholder.
// Egen fil + egen css, så BlogBoard kun har én linje der indsætter den.
import { useEffect, useState } from "react";
import Icon from "@/components/shell/Icon";
import "./idea-cleanup.css";

interface Suggestion { id: string; title: string; kind: string; reason: string; overlapWith?: string }

export default function IdeaCleanup({ onDeleted }: { onDeleted: (id: string) => void }) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/posts/cleanup")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (Array.isArray(d?.suggestions)) setItems(d.suggestions); })
      .catch(() => {}); // ingen forslag er også et fint svar
  }, []);

  if (items.length === 0) return null;

  async function act(s: Suggestion, kind: "slet" | "behold") {
    if (kind === "slet" && !confirm(`Slet "${s.title}"? Det kan ikke fortrydes.`)) return;
    setBusy(s.id);
    setError("");
    try {
      const res = kind === "slet"
        ? await fetch(`/api/posts/${s.id}`, { method: "DELETE" })
        : await fetch("/api/posts/cleanup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ keep: s.id }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "det gik ikke");
      setItems((prev) => prev.filter((x) => x.id !== s.id));
      if (kind === "slet") onDeleted(s.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "det gik ikke");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bl-cleanup" data-open={open}>
      <button type="button" className="bl-cleanup-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span>Hermes foreslår at rydde op i {items.length} {items.length === 1 ? "idé" : "idéer"}</span>
        <Icon name={open ? "ChevronUp" : "ChevronDown"} style={{ width: 14, height: 14, flexShrink: 0 }} />
      </button>
      {open && (
        <ul className="bl-cleanup-list">
          {items.map((s) => (
            <li key={s.id}>
              <strong>{s.title}</strong>
              <span className="bl-cleanup-reason">{s.reason}</span>
              <div className="bl-cleanup-actions">
                <button type="button" className="cc-btn bl-btn-danger" disabled={busy === s.id} onClick={() => void act(s, "slet")}>Slet</button>
                <button type="button" className="cc-btn" disabled={busy === s.id} onClick={() => void act(s, "behold")}>Behold</button>
              </div>
            </li>
          ))}
          {error && <li role="alert" className="bl-error">{error}</li>}
        </ul>
      )}
    </div>
  );
}

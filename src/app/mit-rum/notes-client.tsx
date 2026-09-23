"use client";
// /mit-rum — klient-delen: tilføj/slet noter via /api/mit-rum/notes og hent
// den friske liste med router.refresh() (server-komponenten ejer sandheden).
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PrivateNote } from "@/lib/mit-rum";

export default function NotesClient({ initialNotes }: { initialNotes: PrivateNote[] }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/mit-rum/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "kunne ikke gemme noten");
        return;
      }
      setText("");
      router.refresh();
    } catch {
      setError("kunne ikke gemme noten");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/mit-rum/notes?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !data?.ok) {
        setError(data?.error ?? "kunne ikke slette noten");
        return;
      }
      router.refresh();
    } catch {
      setError("kunne ikke slette noten");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cc-client-page">
      <form className="cc-card cc-card-pad" onSubmit={add} style={{ display: "grid", gap: 12 }}>
        <textarea
          className="cc-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Skriv en privat note …"
          aria-label="Ny privat note"
          rows={3}
          maxLength={2000}
          style={{ resize: "vertical", minHeight: 72 }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button type="submit" className="cc-btn cc-btn-accent cc-focus" disabled={!text.trim() || busy}>
            {busy ? "Gemmer …" : "Gem note"}
          </button>
          <span className="cc-sub" style={{ margin: 0, fontSize: 12.5 }}>
            {text.trim().length}/2000 tegn
          </span>
        </div>
        {error && (
          <p role="alert" style={{ margin: 0, color: "var(--amber)", fontSize: 13, fontWeight: 600 }}>
            {error}
          </p>
        )}
      </form>

      {initialNotes.length === 0 ? (
        <div className="cc-card cc-card-pad">
          <p className="cc-sub" style={{ margin: 0 }}>
            Ingen noter endnu. Den første du skriver her, er kun synlig for dig.
          </p>
        </div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 10 }}>
          {initialNotes.map((n) => (
            <li
              key={n.id}
              className="cc-card cc-card-pad"
              style={{ display: "flex", alignItems: "flex-start", gap: 14 }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{n.text}</p>
                <p className="cc-mono cc-sub" style={{ margin: "6px 0 0", fontSize: 12 }}>
                  {new Date(n.ts).toLocaleString("da-DK", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <button
                type="button"
                className="cc-btn cc-focus"
                onClick={() => remove(n.id)}
                disabled={busy}
                aria-label="Slet note"
              >
                Slet
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

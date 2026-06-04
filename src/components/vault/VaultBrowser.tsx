"use client";
import { useEffect, useMemo, useState } from "react";
import Icon from "@/components/shell/Icon";
import MarkdownLite from "@/components/shell/MarkdownLite";

export interface VaultEntry {
  pathRel: string;
  title: string;
  source: string;
}

interface NoteState {
  loading: boolean;
  body: string;
  source: string;
  error: string;
}

// Two-pane vault browser: searchable note list on the left, markdown render on
// the right. Used by /memory and /journal. Notes load on demand via
// /api/vault/note (token-discipline — never the whole vault at once).
export default function VaultBrowser({
  entries,
  source,
  emptyHint,
  groupByDir = true,
}: {
  entries: VaultEntry[];
  source: "local" | "remote" | "none";
  emptyHint: string;
  groupByDir?: boolean;
}) {
  const first = entries[0]?.pathRel ?? null;
  const [active, setActive] = useState<string | null>(first);
  const [q, setQ] = useState("");
  // Starts in the loading state so the mount effect can fill it after the await
  // (no synchronous setState in an effect).
  const [note, setNote] = useState<NoteState>({ loading: Boolean(first), body: "", source: "", error: "" });

  async function fetchNote(pathRel: string): Promise<NoteState> {
    try {
      const res = await fetch(`/api/vault/note?path=${encodeURIComponent(pathRel)}`);
      const d = await res.json();
      if (!d.ok) return { loading: false, body: "", source: "", error: d.reason ?? "ikke fundet" };
      return { loading: false, body: d.body || d.raw || "", source: d.source, error: "" };
    } catch (e) {
      return { loading: false, body: "", source: "", error: String(e) };
    }
  }

  // Auto-open the first note on mount.
  useEffect(() => {
    if (!first) return;
    let cancelled = false;
    fetchNote(first).then((n) => { if (!cancelled) setNote(n); });
    return () => { cancelled = true; };
  }, [first]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return entries;
    return entries.filter((e) => e.title.toLowerCase().includes(t) || e.pathRel.toLowerCase().includes(t));
  }, [q, entries]);

  const groups = useMemo(() => {
    if (!groupByDir) return [["", filtered]] as [string, VaultEntry[]][];
    const map = new Map<string, VaultEntry[]>();
    for (const e of filtered) {
      const dir = e.pathRel.includes("/") ? e.pathRel.split("/").slice(0, -1).join("/") : "(rod)";
      if (!map.has(dir)) map.set(dir, []);
      map.get(dir)!.push(e);
    }
    return [...map.entries()];
  }, [filtered, groupByDir]);

  async function open(pathRel: string) {
    setActive(pathRel);
    setNote({ loading: true, body: "", source: "", error: "" });
    setNote(await fetchNote(pathRel));
  }

  if (source === "none" || entries.length === 0) {
    return (
      <div className="cc-card">
        <div className="cc-empty">
          <Icon name="Brain" />
          <div>Vaulten er ikke koblet på endnu.</div>
          <div className="cc-dim" style={{ fontSize: 12, maxWidth: "46ch" }}>{emptyHint}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 300px) 1fr", gap: 16, alignItems: "start" }} className="cc-vault-grid">
      <aside className="cc-card" style={{ overflow: "hidden" }}>
        <div style={{ padding: 12, borderBottom: "1px solid var(--border)" }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Søg noter…"
            aria-label="Søg i vaulten"
            style={{ width: "100%", height: 34, borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-2)", padding: "0 10px", fontSize: 13, color: "var(--text)" }}
          />
        </div>
        <div style={{ maxHeight: "62dvh", overflowY: "auto", padding: 6 }}>
          {filtered.length === 0 && <div className="cc-dim" style={{ padding: 14, fontSize: 13 }}>Ingen match.</div>}
          {groups.map(([dir, items]) => (
            <div key={dir} style={{ marginBottom: 6 }}>
              {groupByDir && dir && <div className="cc-kicker" style={{ padding: "8px 10px 4px" }}>{dir}</div>}
              {items.map((e) => (
                <button
                  key={e.pathRel}
                  onClick={() => open(e.pathRel)}
                  className="cc-focus"
                  data-active={active === e.pathRel}
                  style={{
                    display: "block", width: "100%", textAlign: "left", border: "none", cursor: "pointer",
                    padding: "8px 10px", borderRadius: 8, fontSize: 13, fontFamily: "inherit",
                    color: active === e.pathRel ? "var(--accent-ink)" : "var(--text-muted)",
                    background: active === e.pathRel ? "var(--accent-soft)" : "transparent",
                    fontWeight: active === e.pathRel ? 600 : 500,
                  }}
                >
                  {e.title}
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>

      <section className="cc-card cc-card-pad" style={{ minHeight: 240 }}>
        {!active ? (
          <div className="cc-empty"><Icon name="BookOpen" /><div>Vælg en note til venstre.</div></div>
        ) : note.loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="cc-skel" style={{ height: 22, width: "40%" }} />
            <div className="cc-skel" style={{ height: 14 }} />
            <div className="cc-skel" style={{ height: 14, width: "85%" }} />
            <div className="cc-skel" style={{ height: 14, width: "70%" }} />
          </div>
        ) : note.error ? (
          <div style={{ display: "flex", gap: 10, alignItems: "center", color: "var(--text-muted)" }}>
            <Icon name="Activity" style={{ width: 17, height: 17, color: "var(--amber)" }} />
            <span style={{ fontSize: 13.5 }}>Kunne ikke åbne noten: {note.error}</span>
          </div>
        ) : (
          <>
            {note.source && <div className="cc-kicker" style={{ marginBottom: 10 }}>kilde: {note.source} · {active}</div>}
            <MarkdownLite source={note.body} />
          </>
        )}
      </section>
      <style>{`@media (max-width:760px){ .cc-vault-grid{ grid-template-columns:1fr !important; } }`}</style>
    </div>
  );
}

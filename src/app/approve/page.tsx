"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

// Mirror of QueueDraft (src/lib/queue.ts) — kept local so this client component
// has no server-only imports.
interface Demo {
  label: string;
  url: string;
}
type DraftStatus = "pending" | "approved" | "edited" | "rejected";
interface QueueDraft {
  id: string;
  leadId: string;
  name: string;
  branch: string;
  city: string;
  hooks: string[];
  demoPair: Demo[];
  professionalism: string;
  subject: string;
  body: string;
  status: DraftStatus;
  source: string;
  createdAt: string;
  updatedAt: string;
}

type Filter = "pending" | "decided" | "all";

const STATUS_META: Record<DraftStatus, { label: string; fg: string; bg: string }> = {
  pending: { label: "afventer", fg: "var(--amber)", bg: "var(--amber-dim)" },
  approved: { label: "godkendt", fg: "var(--green)", bg: "var(--green-dim)" },
  edited: { label: "redigeret · godkendt", fg: "var(--blue)", bg: "var(--blue-dim)" },
  rejected: { label: "afvist", fg: "var(--red)", bg: "#dc26261a" },
};

export default function ApprovePage() {
  const [drafts, setDrafts] = useState<QueueDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("pending");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/approve/queue", { cache: "no-store" });
      const data = await res.json();
      setDrafts(Array.isArray(data.drafts) ? data.drafts : []);
      setError(null);
    } catch {
      setError("Kunne ikke hente køen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const patchLocal = useCallback((d: QueueDraft) => {
    setDrafts((prev) => prev.map((x) => (x.id === d.id ? d : x)));
  }, []);

  const counts = useMemo(() => {
    const pending = drafts.filter((d) => d.status === "pending").length;
    const decided = drafts.length - pending;
    return { pending, decided, all: drafts.length };
  }, [drafts]);

  const visible = useMemo(() => {
    if (filter === "pending") return drafts.filter((d) => d.status === "pending");
    if (filter === "decided") return drafts.filter((d) => d.status !== "pending");
    return drafts;
  }, [drafts, filter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <Header counts={counts} filter={filter} setFilter={setFilter} onRefresh={load} loading={loading} />

      {error && (
        <p style={{ color: "var(--red)", fontSize: 14 }}>{error}</p>
      )}

      {!loading && visible.length === 0 ? (
        <EmptyState filter={filter} total={drafts.length} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {visible.map((d) => (
            <DraftLetter key={d.id} draft={d} onChange={patchLocal} />
          ))}
        </div>
      )}
    </div>
  );
}

function Header({
  counts,
  filter,
  setFilter,
  onRefresh,
  loading,
}: {
  counts: { pending: number; decided: number; all: number };
  filter: Filter;
  setFilter: (f: Filter) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: "pending", label: "Afventer", n: counts.pending },
    { key: "decided", label: "Besluttet", n: counts.decided },
    { key: "all", label: "Alle", n: counts.all },
  ];
  return (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div>
        <h1
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontSize: 27,
            fontWeight: 700,
            color: "var(--text)",
            letterSpacing: "-0.03em",
            lineHeight: 1,
            margin: 0,
          }}
        >
          Til godkendelse
        </h1>
        <p style={{ marginTop: 8, fontSize: 13, color: "var(--text-muted)", maxWidth: "62ch" }}>
          Personlige udkast fra motoren. Læs hver som et brev, ret hvis nødvendigt, godkend de gode.
          Intet sendes herfra: godkend markerer kun til afsendelse.
        </p>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ display: "flex", background: "var(--bg-3)", borderRadius: 9, padding: 3 }}>
          {tabs.map((t) => {
            const active = filter === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                style={{
                  border: "none",
                  cursor: "pointer",
                  padding: "6px 12px",
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  color: active ? "var(--text)" : "var(--text-muted)",
                  background: active ? "var(--surface)" : "transparent",
                  boxShadow: active ? "0 1px 2px oklch(0% 0 0 / 0.08)" : "none",
                  transition: "color 120ms ease",
                }}
              >
                {t.label}
                <span style={{ marginLeft: 6, color: "var(--text-dim)", fontWeight: 500 }}>{t.n}</span>
              </button>
            );
          })}
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          title="Genindlæs køen"
          style={{
            border: "1px solid var(--border)",
            background: "var(--surface)",
            color: "var(--text-muted)",
            cursor: loading ? "default" : "pointer",
            padding: "7px 11px",
            borderRadius: 8,
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: "inherit",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "…" : "Opdatér"}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ filter, total }: { filter: Filter; total: number }) {
  const emptyBecauseFilter = total > 0;
  return (
    <div
      style={{
        border: "1px dashed var(--border-light)",
        borderRadius: 14,
        padding: "44px 32px",
        textAlign: "center",
        background: "var(--bg-2)",
      }}
    >
      <p style={{ fontFamily: "var(--font-fraunces), serif", fontSize: 18, color: "var(--text)", margin: 0 }}>
        {emptyBecauseFilter ? "Intet her endnu" : "Køen er tom"}
      </p>
      <p style={{ marginTop: 8, fontSize: 13.5, color: "var(--text-muted)" }}>
        {emptyBecauseFilter
          ? filter === "pending"
            ? "Alle udkast er besluttet. Godt arbejde."
            : "Ingen besluttede udkast endnu."
          : "Kør motoren for at fylde den med dagens personlige udkast:"}
      </p>
      {!emptyBecauseFilter && (
        <code
          style={{
            display: "inline-block",
            marginTop: 12,
            padding: "7px 12px",
            borderRadius: 8,
            background: "var(--bg-3)",
            border: "1px solid var(--border)",
            fontSize: 12.5,
            color: "var(--text)",
          }}
        >
          node .send_queue/daily_engine.mjs --limit=12
        </code>
      )}
    </div>
  );
}

function DraftLetter({ draft, onChange }: { draft: QueueDraft; onChange: (d: QueueDraft) => void }) {
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [busy, setBusy] = useState<null | "approve" | "edit" | "reject">(null);
  const [violations, setViolations] = useState<string[]>([]);

  const dirty = subject !== draft.subject || body !== draft.body;
  const decided = draft.status !== "pending";
  const meta = STATUS_META[draft.status];

  const act = useCallback(
    async (action: "approve" | "edit" | "reject") => {
      setBusy(action);
      setViolations([]);
      try {
        const res = await fetch("/api/approve/queue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "edit" ? { id: draft.id, action, subject, body } : { id: draft.id, action }
          ),
        });
        const data = await res.json();
        if (!res.ok) {
          if (res.status === 422 && Array.isArray(data.violations)) setViolations(data.violations);
          else setViolations([data.error ?? "Ukendt fejl"]);
          return;
        }
        onChange(data.draft as QueueDraft);
      } catch {
        setViolations(["Netværksfejl. Prøv igen."]);
      } finally {
        setBusy(null);
      }
    },
    [draft.id, subject, body, onChange]
  );

  return (
    <article
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "22px 24px",
        opacity: draft.status === "rejected" ? 0.55 : 1,
        transition: "opacity 200ms ease",
      }}
    >
      {/* identity row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2
            style={{
              fontFamily: "var(--font-fraunces), serif",
              fontSize: 19,
              fontWeight: 700,
              color: "var(--text)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            {draft.name}
          </h2>
          <p style={{ marginTop: 3, fontSize: 12.5, color: "var(--text-muted)" }}>
            {[draft.branch, draft.city].filter(Boolean).join(" · ")}
            {draft.professionalism ? (
              <span style={{ color: "var(--text-dim)" }}> — {draft.professionalism}</span>
            ) : null}
          </p>
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: 11.5,
            fontWeight: 600,
            color: meta.fg,
            background: meta.bg,
            padding: "4px 10px",
            borderRadius: 999,
            whiteSpace: "nowrap",
          }}
        >
          {meta.label}
        </span>
      </div>

      {/* hooks */}
      {draft.hooks.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
          {draft.hooks.map((h, i) => (
            <span
              key={i}
              style={{
                fontSize: 12,
                color: "var(--text-muted)",
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                padding: "3px 9px",
                borderRadius: 7,
                maxWidth: "46ch",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={h}
            >
              {h}
            </span>
          ))}
        </div>
      )}

      {/* the letter */}
      <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 10 }}>
        <Field label="Emne">
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={decided}
            style={inputStyle(decided)}
          />
        </Field>
        <Field label="Besked">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={decided}
            rows={Math.min(16, Math.max(7, body.split("\n").length + 1))}
            style={{
              ...inputStyle(decided),
              resize: "vertical",
              lineHeight: 1.6,
              fontSize: 13.5,
              maxWidth: "70ch",
            }}
          />
        </Field>
      </div>

      {/* demos */}
      {draft.demoPair.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 14 }}>
          {draft.demoPair.map((d, i) => (
            <a
              key={i}
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontSize: 12.5,
                color: "var(--text)",
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                padding: "7px 12px",
                borderRadius: 9,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{d.label}</span>
              <span style={{ color: "var(--green)", fontWeight: 600 }}>{prettyUrl(d.url)} ↗</span>
            </a>
          ))}
        </div>
      )}

      {/* violations */}
      {violations.length > 0 && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 9,
            background: "var(--amber-dim)",
            border: "1px solid var(--amber)",
            fontSize: 12.5,
            color: "var(--text)",
          }}
        >
          <strong style={{ color: "var(--amber)" }}>Bryder stemme-guiden:</strong>{" "}
          {violations.join(" · ")}
        </div>
      )}

      {/* actions */}
      {!decided && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 18 }}>
          <button onClick={() => act("approve")} disabled={busy !== null || dirty} style={btnPrimary(busy === "approve" || dirty)}>
            {busy === "approve" ? "Godkender…" : "Godkend"}
          </button>
          {dirty && (
            <button onClick={() => act("edit")} disabled={busy !== null} style={btnSecondary}>
              {busy === "edit" ? "Gemmer…" : "Gem rettelse + godkend"}
            </button>
          )}
          <button onClick={() => act("reject")} disabled={busy !== null} style={btnGhost}>
            {busy === "reject" ? "Afviser…" : "Afvis"}
          </button>
          {dirty && (
            <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>
              Rettet — gem for at godkende
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function inputStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    border: "1px solid var(--border)",
    borderRadius: 9,
    padding: "9px 11px",
    fontFamily: "inherit",
    fontSize: 13.5,
    color: "var(--text)",
    background: disabled ? "var(--bg-2)" : "var(--bg-2)",
    outline: "none",
    opacity: disabled ? 0.85 : 1,
  };
}

const btnBase: React.CSSProperties = {
  border: "none",
  borderRadius: 9,
  padding: "9px 16px",
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "inherit",
  cursor: "pointer",
};

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    ...btnBase,
    background: disabled ? "var(--green-dim)" : "var(--green)",
    color: disabled ? "var(--green)" : "white",
    cursor: disabled ? "default" : "pointer",
  };
}

const btnSecondary: React.CSSProperties = {
  ...btnBase,
  background: "var(--blue)",
  color: "white",
};

const btnGhost: React.CSSProperties = {
  ...btnBase,
  background: "transparent",
  color: "var(--text-muted)",
  padding: "9px 12px",
};

function prettyUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
